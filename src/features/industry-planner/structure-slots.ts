import { hostsReactions } from './structure-factors';
import type { AvailableStructure } from './types';

export type LockSystem = { id: number; name: string; security: number | null };

export function isSystemLocked(structure: AvailableStructure): boolean {
  return structure.systemId !== null;
}

export function visibleStructuresForSlot(
  structures: AvailableStructure[],
  effectiveSystemId: number | null,
  selectedStructureId: string | null,
): AvailableStructure[] {
  return structures.filter(
    (s) =>
      s.id === selectedStructureId ||
      s.systemId === null ||
      effectiveSystemId === null ||
      s.systemId === effectiveSystemId,
  );
}

export function deduceLockedSystem(
  selected: AvailableStructure | null,
  systems: readonly LockSystem[],
  fallbackSystemId: number | null,
): {
  lockedStructure: AvailableStructure | null;
  deducedSystem: LockSystem | null;
  effectiveSystemId: number | null;
} {
  const lockedStructure = selected !== null && isSystemLocked(selected) ? selected : null;
  const deducedSystem = lockedStructure
    ? systems.find((s) => s.id === lockedStructure.systemId) ?? null
    : null;
  const effectiveSystemId = lockedStructure?.systemId ?? fallbackSystemId;
  return { lockedStructure, deducedSystem, effectiveSystemId };
}

export type LockTransition =
  | { kind: 'lock'; system: LockSystem }
  | { kind: 'lock-unresolved' }
  | { kind: 'unlock' }
  | { kind: 'none' };

export function lockTransition(
  prev: AvailableStructure | null,
  next: AvailableStructure | null,
  systems: readonly LockSystem[],
): LockTransition {
  const wasLocked = prev !== null && isSystemLocked(prev);
  if (next && isSystemLocked(next)) {
    const system = systems.find((s) => s.id === next.systemId) ?? null;
    return system ? { kind: 'lock', system } : { kind: 'lock-unresolved' };
  }
  if (wasLocked) return { kind: 'unlock' };
  return { kind: 'none' };
}

export function reactionRefineryCandidates(
  structures: AvailableStructure[],
  selectedBuildStructureId: string | null,
): AvailableStructure[] {
  return structures.filter((s) => hostsReactions(s.groupId) && s.id !== selectedBuildStructureId);
}

export function deriveReactionSlotView(
  reactionStructure: AvailableStructure | null,
  availableStructures: AvailableStructure[],
  selectedBuildStructure: { id: string } | null,
  systems: readonly LockSystem[],
  reactionSystem: { systemId: number } | null,
): {
  lockedRefinery: AvailableStructure | null;
  deducedSystem: LockSystem | null;
  refineries: AvailableStructure[];
  taxPct: number | null;
  lockedTo: string | null;
} {
  const { lockedStructure, deducedSystem, effectiveSystemId } = deduceLockedSystem(
    reactionStructure,
    systems,
    reactionSystem?.systemId ?? null,
  );
  const refineries = visibleStructuresForSlot(
    reactionRefineryCandidates(availableStructures, selectedBuildStructure?.id ?? null),
    effectiveSystemId,
    reactionStructure?.id ?? null,
  );
  return {
    lockedRefinery: lockedStructure,
    deducedSystem,
    refineries,
    taxPct: reactionStructure?.taxPct ?? null,
    lockedTo: lockedStructure?.name ?? null,
  };
}
