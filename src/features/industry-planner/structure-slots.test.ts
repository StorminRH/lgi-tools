import { describe, expect, it } from 'vitest';
import { isSystemLocked, visibleStructuresForSlot } from './structure-slots';
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
