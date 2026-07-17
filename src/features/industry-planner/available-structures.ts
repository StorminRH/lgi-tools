// Pure assembly of the /api/account/structures payload: the caller's CUSTOM
// structures (3.7.9.1.4) and their corp's PULLED structures (3.7.9.1.5) merge
// into the source-agnostic AvailableStructure rows the planner's selector
// consumes. Lives with the contract it produces (consumer-owns-the-contract);
// the inputs are structural shapes of the route's query rows, so this module
// imports no other feature. The route stays the fetch/respond shell.
import { SDE_ENGINEERING_COMPLEX_GROUP_ID } from '@/data/eve-data/constants';
import type { AvailableStructure } from './api-contract';

export interface CustomStructureInput {
  id: string;
  name: string;
  structureTypeId: number;
  rigTypeIds: number[];
  systemId: number | null;
  taxPct: number | null;
}

export interface CorpStructureInput {
  structureId: number | string;
  typeId: number;
  name: string | null;
  rigTypeIds: number[];
  systemId: number | null;
  securityClass: AvailableStructure['securityClass'];
  taxPct: number | null;
}

export interface StructureTypeRow {
  typeId: number;
  name: string;
  groupId: number;
}

type DogmaMap = ReadonlyMap<number, Record<string, number>>;

/**
 * Every structure + rig type referenced by either source — the one batched
 * dogma read the route performs.
 */
export function collectDogmaTypeIds(
  custom: readonly CustomStructureInput[],
  corp: readonly CorpStructureInput[],
): number[] {
  const typeIds = new Set<number>();
  for (const c of custom) {
    typeIds.add(c.structureTypeId);
    for (const r of c.rigTypeIds) typeIds.add(r);
  }
  for (const s of corp) {
    typeIds.add(s.typeId);
    for (const r of s.rigTypeIds) typeIds.add(r);
  }
  return [...typeIds];
}

// The structure's coverage group. Defensive default only — a row past the
// knownTypeIds gate always resolves (knownTypeIds and the group map both
// derive from structureTypes).
function resolveGroupId(groupIdByType: Map<number, number>, typeId: number): number {
  return groupIdByType.get(typeId) ?? SDE_ENGINEERING_COMPLEX_GROUP_ID;
}

export function buildAvailableStructures(
  custom: readonly CustomStructureInput[],
  corp: readonly CorpStructureInput[],
  structureTypes: readonly StructureTypeRow[],
  dogma: DogmaMap,
): AvailableStructure[] {
  const knownTypeIds = new Set(structureTypes.map((t) => t.typeId));
  const typeNameById = new Map(structureTypes.map((t) => [t.typeId, t.name]));
  // The structure's SDE group (EC / Refinery / Citadel) — the planner's
  // coverage input (only a Refinery hosts reactions).
  const groupIdByType = new Map(structureTypes.map((t) => [t.typeId, t.groupId]));

  const structures: AvailableStructure[] = [];
  for (const c of custom) {
    // A structure type that's no longer a known industry structure (an SDE
    // drift) is dropped rather than shown without resolvable dogma.
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
      taxPct: c.taxPct,
    });
  }
  for (const s of corp) {
    if (!knownTypeIds.has(s.typeId)) continue;
    structures.push({
      // A namespaced, stable id distinct from custom UUIDs (structure ids are
      // globally unique in EVE), so the selector can tell the two sources apart.
      id: `corp:${s.structureId}`,
      source: 'corp',
      // The corp endpoint's authoritative name; the type name is the fallback
      // for a rare nameless structure (mirrors the selector's documented fallback).
      name: s.name ?? typeNameById.get(s.typeId) ?? `Structure ${s.structureId}`,
      structureTypeId: s.typeId,
      groupId: resolveGroupId(groupIdByType, s.typeId),
      // Corp structures carry their home system + SDE-derived security band —
      // the planner deduces-and-locks the build system from this on select.
      systemId: s.systemId,
      structureAttrs: dogma.get(s.typeId) ?? {},
      rigAttrs: s.rigTypeIds.map((r) => dogma.get(r) ?? {}),
      securityClass: s.securityClass,
      taxPct: s.taxPct,
    });
  }
  return structures;
}
