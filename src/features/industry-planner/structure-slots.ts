import type { AvailableStructure } from './types';

// The ONE system-binding check (3.7.13.2): a structure with a home system is
// LOCKED to it — selecting it sets and locks its slot's system. Corp
// structures always carry one (the pull's systemId); a custom structure
// carries one iff its owner pinned it in the builder. A portable (unpinned)
// custom structure has none and never touches the slot's system. Security is
// NEVER read off the structure here — a lock only decides WHICH system the
// slot points at; the bonus math still derives its band from that system.
export function isSystemLocked(structure: AvailableStructure): boolean {
  return structure.systemId !== null;
}

// The per-source segmented slot list: which structures a slot offers for its
// effective system. Portable structures show everywhere; locked structures
// show only in their own system's list. With no system picked every
// structure shows — the either-order flow: picking a locked one then
// deduce-locks the system. The currently-selected structure is always
// retained so a native <select>'s value can never dangle while a lock's
// system data is still loading.
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
