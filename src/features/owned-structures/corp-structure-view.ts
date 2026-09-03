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
  rigLabels: { key: number; label: string }[];
  taxLabel: string | null;

  hasDetails: boolean;
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
  const rigName = new Map(opts.structureRigs.map((r) => [r.typeId, r.name]));
  return {
    typeName,
    displayName: structure.name ?? typeName,
    validRigs,
    rigLabels: structure.rigTypeIds.map((r) => ({ key: r, label: rigName.get(r) ?? `Rig ${r}` })),
    taxLabel: structure.taxPct !== null ? `tax ${structure.taxPct}%` : null,
    hasDetails: structure.rigTypeIds.length > 0 || structure.taxPct !== null,
  };
}

export type CorpCardView = {

  hint: string;
  showManagerNote: boolean;

  managerBlurb: string;

  showStructures: boolean;
  isEmpty: boolean;
};

export function deriveCorpCardView(corp: CorpStructurePageView): CorpCardView {
  return {
    hint: corp.isStationManager ? (corp.sharingEnabled ? 'sharing on' : 'sharing off') : 'shared',
    showManagerNote: corp.isStationManager,
    managerBlurb: corp.sharingEnabled
      ? '.'
      : ' — turn it on to make this corporation’s structures selectable as build locations for every member.',
    showStructures: corp.sharingEnabled,
    isEmpty: corp.structures.length === 0,
  };
}
