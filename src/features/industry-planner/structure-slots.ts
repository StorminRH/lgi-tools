import { hostsReactions } from './structure-factors';
import type { AvailableStructure } from './types';

/**
 * The minimal system shape the lock helpers read (structurally a
 * SystemSearchEntry) — a locked structure's home system resolves to one of these.
 */
export type LockSystem = { id: number; name: string; security: number | null };

/**
 * The ONE system-binding check (3.7.13.2): a structure with a home system is
 * LOCKED to it — selecting it sets and locks its slot's system. Corp
 * structures always carry one (the pull's systemId); a custom structure
 * carries one iff its owner pinned it in the builder. A portable (unpinned)
 * custom structure has none and never touches the slot's system. Security is
 * NEVER read off the structure here — a lock only decides WHICH system the
 * slot points at; the bonus math still derives its band from that system.
 */
export function isSystemLocked(structure: AvailableStructure): boolean {
  return structure.systemId !== null;
}

/**
 * The per-source segmented slot list: which structures a slot offers for its
 * effective system. Portable structures show everywhere; locked structures
 * show only in their own system's list. With no system picked every
 * structure shows — the either-order flow: picking a locked one then
 * deduce-locks the system. The currently-selected structure is always
 * retained so a native <select>'s value can never dangle while a lock's
 * system data is still loading.
 */
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

/**
 * The derived lock state a structure slot renders from: a selected LOCKED
 * structure (corp or pinned custom) deduce-locks the slot's system, so the slot
 * shows that system (from the index, before any fetch) and segments its list
 * against it. `fallbackSystemId` is the slot's own picked-system id, used only
 * when nothing is locked. Shared by the build and reaction slots.
 */
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

/**
 * The system-lock intent of a structure-slot selection change, given the systems
 * index to resolve a newly-locked structure's home system. The slot's handler
 * dispatches its OWN setters per intent (the build slot seeds + applies a build
 * location; the reaction slot sets its reaction system) — this is the shared
 * DECISION, not the shared effect. `lock` carries a resolved system;
 * `lock-unresolved` is a locked pick whose system isn't in the index yet (a fast
 * pick before the mount fetch); `unlock` is leaving a lock for a portable/none
 * pick; `none` is a portable→portable change that never touches the system.
 */
export type LockTransition =
  | { kind: 'lock'; system: LockSystem }
  | { kind: 'lock-unresolved' }
  | { kind: 'unlock' }
  | { kind: 'none' };

/** Returns the next build-location lock state for a slot change, preserving explicitly locked selections. */
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

/**
 * The reaction slot's candidate refineries: structures that host reactions,
 * excluding the one already chosen as the build structure (no double-select).
 * The caller then segments this against the slot's effective system.
 */
export function reactionRefineryCandidates(
  structures: AvailableStructure[],
  selectedBuildStructureId: string | null,
): AvailableStructure[] {
  return structures.filter((s) => hostsReactions(s.groupId) && s.id !== selectedBuildStructureId);
}

/**
 * Everything the reaction slot renders from, derived in one pure pass so the
 * component carries no derivation branching: the deduced lock state, the
 * segmented refinery list (reaction-hosting, minus the build structure, then
 * scoped to the slot's effective system), plus the readout tax percent and the
 * locked refinery's name. Composes the shared slot helpers.
 */
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
