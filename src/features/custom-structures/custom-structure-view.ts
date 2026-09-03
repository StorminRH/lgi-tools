import {
  rigFitsStructure,
  type StructureRigOption,
  type StructureTypeOption,
} from '@/data/eve-data/structures';
import { formatSec, type SystemSearchEntry } from '@/data/eve-data/systems-search';
import type { CustomStructureRow } from './types';

export function deriveBuilderView(opts: {
  structureTypeId: number | null;
  structureTypes: StructureTypeOption[];
  structureRigs: StructureRigOption[];
  name: string;
  busy: boolean;
}): { structure: StructureTypeOption | null; validRigs: StructureRigOption[]; canSave: boolean } {
  const { structureTypeId, structureTypes, structureRigs, name, busy } = opts;
  const structure =
    structureTypeId === null
      ? null
      : structureTypes.find((t) => t.typeId === structureTypeId) ?? null;
  const validRigs = structure ? structureRigs.filter((r) => rigFitsStructure(r, structure)) : [];
  const canSave = readyBuildInput(structureTypeId, name, busy) !== null;
  return { structure, validRigs, canSave };
}

export function readyBuildInput(
  structureTypeId: number | null,
  name: string,
  busy: boolean,
): { structureTypeId: number; name: string } | null {
  if (structureTypeId === null || name.trim().length === 0 || busy) return null;
  return { structureTypeId, name: name.trim() };
}

export function buildCreateStructurePayload(opts: {
  structureTypeId: number;
  name: string;
  rigSlots: (number | null)[];
  pin: { id: number } | null;
  taxValue: number | null;
}): {
  name: string;
  structureTypeId: number;
  rigTypeIds: number[];
  systemId: number | null;
  taxPct: number | null;
} {
  return {
    name: opts.name,
    structureTypeId: opts.structureTypeId,
    rigTypeIds: opts.rigSlots.filter((x): x is number => x !== null),
    systemId: opts.pin?.id ?? null,
    taxPct: opts.taxValue,
  };
}

export function canReadFit(paste: string, busy: boolean): boolean {
  return paste.trim() !== '' && !busy;
}

export function slotsFromParsedFit(rigTypeIds: number[], slotIndices: number[]): (number | null)[] {
  return slotIndices.map((i) => rigTypeIds[i] ?? null);
}

export function resolveFitName(
  current: string,
  parsedTypeId: number,
  typeName: Map<number, string>,
): string {
  return current.trim() ? current : typeName.get(parsedTypeId) ?? '';
}

function pinLabel(systemId: number, systems: SystemSearchEntry[]): string {
  const sys = systems.find((s) => s.id === systemId);
  return sys ? `${sys.name} ${formatSec(sys.security)}` : `System ${systemId}`;
}

export type SavedStructureRowView = {
  name: string;
  typeLabel: string;
  rigLabels: { key: number; label: string }[];
  hasNoRigs: boolean;
  isPinned: boolean;
  pinLabel: string | null;
  taxLabel: string | null;
};

export function deriveSavedRowView(
  row: CustomStructureRow,
  opts: {
    typeName: Map<number, string>;
    rigName: Map<number, string>;
    systems: SystemSearchEntry[];
  },
): SavedStructureRowView {
  return {
    name: row.name,
    typeLabel: opts.typeName.get(row.structureTypeId) ?? `Type ${row.structureTypeId}`,
    rigLabels: row.rigTypeIds.map((r) => ({ key: r, label: opts.rigName.get(r) ?? `Rig ${r}` })),
    hasNoRigs: row.rigTypeIds.length === 0,
    isPinned: row.systemId !== null,
    pinLabel: row.systemId !== null ? pinLabel(row.systemId, opts.systems) : null,
    taxLabel: row.taxPct !== null ? `tax ${row.taxPct}%` : null,
  };
}
