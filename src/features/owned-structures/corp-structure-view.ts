import {
  rigFitsStructure,
  type StructureRigOption,
  type StructureTypeOption,
} from '@/data/eve-data/structures';
import type { CorpStructurePageStructure, CorpStructurePageView } from './types';

export type CorpStructureItemView = {
  typeName: string;
  displayName: string;
  validRigs: StructureRigOption[];
};

export function deriveCorpStructureItemView(
  structure: CorpStructurePageStructure,
  opts: { structureTypes: StructureTypeOption[]; structureRigs: StructureRigOption[] },
): CorpStructureItemView {
  const typeOption = opts.structureTypes.find((t) => t.typeId === structure.typeId) ?? null;
  const typeName = typeOption?.name ?? `Type ${structure.typeId}`;
  const validRigs = typeOption
    ? opts.structureRigs.filter((r) => rigFitsStructure(r, typeOption))
    : [];
  return { typeName, displayName: structure.name ?? typeName, validRigs };
}

export type CorpCardView = {
  hint: string;
  sharingBlurb: string;
  isEmpty: boolean;
};

export function deriveCorpCardView(corp: CorpStructurePageView): CorpCardView {
  const on = corp.sharing === 'on';
  return {
    hint: on ? 'sharing on' : 'sharing off',
    sharingBlurb: on
      ? 'Members can pick these structures as build locations in the planner.'
      : 'Sharing is off, so only Station Managers and Directors can pick these structures in the planner.',
    isEmpty: corp.structures.length === 0,
  };
}

export function managedCorps(corps: readonly CorpStructurePageView[]): CorpStructurePageView[] {
  return corps.filter((corp) => corp.structureAccess === 'manage');
}
