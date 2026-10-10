import { unresolvedName } from '@/lib/format/names';
import type { BlueprintStructure } from './types';

/**
 * A planner type's name. queries.ts fills materialNames for every type id in the tree, a superset
 * of the ids buildNodeDisplay covers, so it is the one lookup the planner needs.
 */
export function typeName(structure: Pick<BlueprintStructure, 'materialNames'>, typeId: number): string {
  return structure.materialNames[typeId] ?? unresolvedName('type', typeId);
}

export function typeNamer(structure: Pick<BlueprintStructure, 'materialNames'>): (typeId: number) => string {
  return (typeId) => typeName(structure, typeId);
}
