import { SDE_ENGINEERING_COMPLEX_GROUP_ID } from '@/data/eve-data/constants';
import type { EnteredBonuses } from '@/data/industry-math/entered-bonuses';
import type { AvailableStructure, StructureModifier } from './api-contract';

export interface CustomStructureInput {
  id: string;
  name: string;
  structureTypeId: number;
  rigTypeIds: number[];
  systemId: number | null;
  taxPct: number | null;
  bonuses: EnteredBonuses | null;
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
  /** Whether the hull can fit a capital shipyard. */
  hostsCapitals: boolean;
}

/** Each hull or rig type's resolved industry bonuses. */
export type ModifierMap = ReadonlyMap<number, readonly StructureModifier[]>;

export function collectModifierSourceTypeIds(
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

function modifiersOf(map: ModifierMap, hullTypeId: number, rigTypeIds: readonly number[]): StructureModifier[] {
  return [hullTypeId, ...rigTypeIds].flatMap((typeId) => map.get(typeId) ?? []);
}

function resolveGroupId(groupIdByType: Map<number, number>, typeId: number): number {
  return groupIdByType.get(typeId) ?? SDE_ENGINEERING_COMPLEX_GROUP_ID;
}

export function buildAvailableStructures(
  custom: readonly CustomStructureInput[],
  corp: readonly CorpStructureInput[],
  structureTypes: readonly StructureTypeRow[],
  modifiers: ModifierMap,
): AvailableStructure[] {
  const knownTypeIds = new Set(structureTypes.map((t) => t.typeId));
  const typeNameById = new Map(structureTypes.map((t) => [t.typeId, t.name]));
  const groupIdByType = new Map(structureTypes.map((t) => [t.typeId, t.groupId]));
  const capitalHulls = new Set(structureTypes.flatMap((t) => (t.hostsCapitals ? [t.typeId] : [])));

  const structures: AvailableStructure[] = [];
  for (const c of custom) {
    if (!knownTypeIds.has(c.structureTypeId)) continue;
    structures.push({
      id: c.id,
      source: 'custom',
      name: c.name,
      structureTypeId: c.structureTypeId,
      groupId: resolveGroupId(groupIdByType, c.structureTypeId),
      hostsCapitals: capitalHulls.has(c.structureTypeId),
      systemId: c.systemId,
      modifiers: modifiersOf(modifiers, c.structureTypeId, c.rigTypeIds),
      securityClass: null,
      taxPct: c.taxPct,
      enteredBonuses: c.bonuses,
    });
  }
  for (const s of corp) {
    if (!knownTypeIds.has(s.typeId)) continue;
    structures.push({
      id: `corp:${s.structureId}`,
      source: 'corp',
      name: s.name ?? typeNameById.get(s.typeId) ?? `Structure ${s.structureId}`,
      structureTypeId: s.typeId,
      groupId: resolveGroupId(groupIdByType, s.typeId),
      hostsCapitals: capitalHulls.has(s.typeId),
      systemId: s.systemId,
      modifiers: modifiersOf(modifiers, s.typeId, s.rigTypeIds),
      securityClass: s.securityClass,
      taxPct: s.taxPct,
      enteredBonuses: null,
    });
  }
  return structures;
}
