import { describe, expect, it } from 'vitest';
import {
  deduceLockedSystem,
  deriveReactionSlotView,
  isSystemLocked,
  lockTransition,
  reactionRefineryCandidates,
  visibleStructuresForSlot,
  type LockSystem,
} from './structure-slots';
import type { AvailableStructure } from './types';

function structure(over: Partial<AvailableStructure>): AvailableStructure {
  return {
    id: 'x',
    source: 'custom',
    name: 'X',
    structureTypeId: 35825,
    groupId: 1404,
    systemId: null,
    structureAttrs: {},
    rigAttrs: [],
    securityClass: null,
    taxPct: null,
    ...over,
  };
}

const corpJita = structure({ id: 'corp:1', source: 'corp', name: 'Jita Raitaru', systemId: 30000142, securityClass: 'high' });
const corpBasgerin = structure({ id: 'corp:2', source: 'corp', name: 'Basgerin Sotiyo', systemId: 30003074, securityClass: 'low' });
const portable = structure({ id: 'c1', name: 'Portable Azbel' });
const pinnedJita = structure({ id: 'c2', name: 'Pinned Tatara', groupId: 1406, systemId: 30000142 });

const ALL = [corpJita, corpBasgerin, portable, pinnedJita];

describe('isSystemLocked', () => {
  it('locks corp structures and pinned customs; portable customs stay free', () => {
    expect(isSystemLocked(corpJita)).toBe(true);
    expect(isSystemLocked(pinnedJita)).toBe(true);
    expect(isSystemLocked(portable)).toBe(false);
  });
});

describe('visibleStructuresForSlot', () => {
  it('shows every structure when no system is picked (either-order: a locked pick then deduce-locks)', () => {
    expect(visibleStructuresForSlot(ALL, null, null)).toEqual(ALL);
  });

  it('hides locked structures homed in OTHER systems once a system is picked', () => {
    expect(visibleStructuresForSlot(ALL, 30000142, null)).toEqual([corpJita, portable, pinnedJita]);
    // A system where nothing is homed still offers every portable structure.
    expect(visibleStructuresForSlot(ALL, 31000001, null)).toEqual([portable]);
  });

  it('always retains the currently-selected structure so the select value never dangles', () => {
    // The lock's own system data may still be loading (or its silent fetch
    // failed) while the slot's previous system is the effective one — the
    // just-picked structure must stay listed.
    expect(visibleStructuresForSlot(ALL, 30000142, corpBasgerin.id)).toEqual([
      corpJita,
      corpBasgerin,
      portable,
      pinnedJita,
    ]);
  });
});

const SYSTEMS: LockSystem[] = [
  { id: 30000142, name: 'Jita', security: 0.9 },
  { id: 30003074, name: 'Basgerin', security: 0.4 },
];

describe('deduceLockedSystem', () => {
  it('deduces and locks a corp structure to its home system', () => {
    expect(deduceLockedSystem(corpJita, SYSTEMS, null)).toEqual({
      lockedStructure: corpJita,
      deducedSystem: { id: 30000142, name: 'Jita', security: 0.9 },
      effectiveSystemId: 30000142,
    });
  });

  it('leaves a portable structure unlocked, falling back to the picked system', () => {
    expect(deduceLockedSystem(portable, SYSTEMS, 30000142)).toEqual({
      lockedStructure: null,
      deducedSystem: null,
      effectiveSystemId: 30000142,
    });
  });

  it('locks with a null deduced system when the index has not loaded it yet', () => {
    const homelessLock = structure({ id: 'corp:9', source: 'corp', name: 'Elsewhere', systemId: 31000001 });
    expect(deduceLockedSystem(homelessLock, SYSTEMS, 30000142)).toEqual({
      lockedStructure: homelessLock,
      deducedSystem: null,
      // The lock's own system still wins over the fallback, even unresolved.
      effectiveSystemId: 31000001,
    });
  });

  it('returns all-null with no selection', () => {
    expect(deduceLockedSystem(null, SYSTEMS, null)).toEqual({
      lockedStructure: null,
      deducedSystem: null,
      effectiveSystemId: null,
    });
  });
});

describe('lockTransition', () => {
  it('locks to the resolved system when a locked structure is picked', () => {
    expect(lockTransition(null, corpJita, SYSTEMS)).toEqual({
      kind: 'lock',
      system: { id: 30000142, name: 'Jita', security: 0.9 },
    });
  });

  it('is lock-unresolved when the picked lock has no system in the index', () => {
    const homelessLock = structure({ id: 'corp:9', source: 'corp', name: 'Elsewhere', systemId: 31000001 });
    expect(lockTransition(null, homelessLock, SYSTEMS)).toEqual({ kind: 'lock-unresolved' });
  });

  it('unlocks when leaving a locked structure for a portable one', () => {
    expect(lockTransition(corpJita, portable, SYSTEMS)).toEqual({ kind: 'unlock' });
  });

  it('unlocks when clearing a locked structure (null pick)', () => {
    expect(lockTransition(corpJita, null, SYSTEMS)).toEqual({ kind: 'unlock' });
  });

  it('is none for a portable→portable change that never touched the system', () => {
    expect(lockTransition(portable, null, SYSTEMS)).toEqual({ kind: 'none' });
    expect(lockTransition(null, portable, SYSTEMS)).toEqual({ kind: 'none' });
  });
});

describe('reactionRefineryCandidates', () => {
  it('keeps only reaction-hosting refineries, excluding the build structure', () => {
    // pinnedJita is the only Refinery (groupId 1406); the rest are Engineering
    // Complexes (1404) which don't host reactions.
    expect(reactionRefineryCandidates(ALL, null)).toEqual([pinnedJita]);
  });

  it('excludes the structure already chosen as the build structure', () => {
    expect(reactionRefineryCandidates(ALL, pinnedJita.id)).toEqual([]);
  });
});

describe('deriveReactionSlotView', () => {
  it('deduces the reaction lock, lists refineries, and surfaces tax + locked name', () => {
    const taxed = structure({
      id: 'corp:tax',
      source: 'corp',
      name: 'Taxed Tatara',
      groupId: 1406,
      systemId: 30000142,
      taxPct: 2.5,
    });
    const view = deriveReactionSlotView(taxed, [...ALL, taxed], null, SYSTEMS, null);
    expect(view.lockedRefinery).toBe(taxed);
    expect(view.deducedSystem).toEqual({ id: 30000142, name: 'Jita', security: 0.9 });
    expect(view.taxPct).toBe(2.5);
    expect(view.lockedTo).toBe('Taxed Tatara');
    // Both Refineries in Jita are listed (pinnedJita + the taxed one).
    expect(view.refineries).toEqual([pinnedJita, taxed]);
  });

  it('excludes the build structure and non-refineries; null tax/name when nothing is locked', () => {
    // corpJita (an Engineering Complex, 1404) is the build structure; the only
    // refinery is pinnedJita, and with no reaction lock nothing is deduced.
    const view = deriveReactionSlotView(null, ALL, corpJita, SYSTEMS, null);
    expect(view.lockedRefinery).toBeNull();
    expect(view.deducedSystem).toBeNull();
    expect(view.taxPct).toBeNull();
    expect(view.lockedTo).toBeNull();
    expect(view.refineries).toEqual([pinnedJita]);
  });
});
