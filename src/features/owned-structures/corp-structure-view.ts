import {
  rigFitsStructure,
  type StructureRigOption,
  type StructureTypeOption,
} from '@/data/eve-data/structures';
import type { CorpStructurePageStructure, CorpStructurePageView } from './types';

export type CorpStructureItemView = {
  typeName: string;
  displayName: string;
  /** Rigs that physically fit this structure — the completion editor's options. */
  validRigs: StructureRigOption[];
  rigLabels: { key: number; label: string }[];
  taxLabel: string | null;
  /** Whether the read-only view has anything to show (rigs or a tax). */
  hasDetails: boolean;
};

/** Everything a corp-structure row renders, resolved from the type/rig lookups. */
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
  /** Header hint: the manager's sharing state, or 'shared' for a member. */
  hint: string;
  showManagerNote: boolean;
  /** The trailing sentence of the manager note (period vs the enable prompt). */
  managerBlurb: string;
  /** Sharing on → show the structures block. */
  showStructures: boolean;
  isEmpty: boolean;
};

/** The per-corp card's header hint, manager note, and structures-block visibility. */
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
