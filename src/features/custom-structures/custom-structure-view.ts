import {
  rigFitsStructure,
  type StructureRigOption,
  type StructureTypeOption,
} from '@/data/eve-data/structures';
import { formatSec, type SystemSearchEntry } from '@/data/eve-data/systems-search';
import type { CustomStructureRow } from './types';

/**
 * The chosen structure, the rigs that fit it, and whether the form can save —
 * the top derivations the builder shell would otherwise carry inline.
 */
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

/**
 * Validate the save preconditions and narrow the structure id in one step: a
 * chosen type, a non-blank name, and not busy. Returns the trimmed name +
 * non-null id, or null when not ready (so the save handler stays a single guard).
 */
export function readyBuildInput(
  structureTypeId: number | null,
  name: string,
  busy: boolean,
): { structureTypeId: number; name: string } | null {
  if (structureTypeId === null || name.trim().length === 0 || busy) return null;
  return { structureTypeId, name: name.trim() };
}

/** The create-structure request body from the validated form state. */
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

/** Whether a pasted fit can be read: some non-blank text, and not already busy. */
export function canReadFit(paste: string, busy: boolean): boolean {
  return paste.trim() !== '' && !busy;
}

/** Fill the fixed rig slots from a parsed fit's rig list (missing → empty slot). */
export function slotsFromParsedFit(rigTypeIds: number[], slotIndices: number[]): (number | null)[] {
  return slotIndices.map((i) => rigTypeIds[i] ?? null);
}

/**
 * The name to keep after reading a fit: the user's current name if they typed
 * one, else the parsed structure's type name (or empty). Setting it
 * unconditionally to this is a no-op when the name is unchanged.
 */
export function resolveFitName(
  current: string,
  parsedTypeId: number,
  typeName: Map<number, string>,
): string {
  return current.trim() ? current : typeName.get(parsedTypeId) ?? '';
}

/** The pin's display name from the loaded universe index; the raw id is the fallback. */
export function pinLabel(systemId: number, systems: SystemSearchEntry[]): string {
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

/** Everything a saved-structure row renders, resolved from lookups. */
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
