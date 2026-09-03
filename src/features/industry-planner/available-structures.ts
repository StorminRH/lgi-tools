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

export type DogmaMap = ReadonlyMap<number, Record<string, number>>;

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

  const groupIdByType = new Map(structureTypes.map((t) => [t.typeId, t.groupId]));

  const structures: AvailableStructure[] = [];
  for (const c of custom) {

    if (!knownTypeIds.has(c.structureTypeId)) continue;
    structures.push({
      id: c.id,
      source: 'custom',
      name: c.name,
      structureTypeId: c.structureTypeId,
      groupId: resolveGroupId(groupIdByType, c.structureTypeId),

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

      id: `corp:${s.structureId}`,
      source: 'corp',

      name: s.name ?? typeNameById.get(s.typeId) ?? `Structure ${s.structureId}`,
      structureTypeId: s.typeId,
      groupId: resolveGroupId(groupIdByType, s.typeId),

      systemId: s.systemId,
      structureAttrs: dogma.get(s.typeId) ?? {},
      rigAttrs: s.rigTypeIds.map((r) => dogma.get(r) ?? {}),
      securityClass: s.securityClass,
      taxPct: s.taxPct,
    });
  }
  return structures;
}
