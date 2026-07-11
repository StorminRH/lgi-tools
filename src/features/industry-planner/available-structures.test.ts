import { describe, expect, it } from 'vitest';
import {
  buildAvailableStructures,
  collectDogmaTypeIds,
  type CorpStructureInput,
  type CustomStructureInput,
  type StructureTypeRow,
} from './available-structures';

const RAITARU = 35825;
const ATHANOR = 35835;
const RIG_A = 43704;
const RIG_B = 43705;

const STRUCTURE_TYPES: StructureTypeRow[] = [
  { typeId: RAITARU, name: 'Raitaru', groupId: 1404 },
  { typeId: ATHANOR, name: 'Athanor', groupId: 1406 },
];

const DOGMA = new Map<number, Record<string, number>>([
  [RAITARU, { '2600': 1 }],
  [ATHANOR, { '2601': 1 }],
  [RIG_A, { '2593': -2 }],
]);

function custom(overrides: Partial<CustomStructureInput> = {}): CustomStructureInput {
  return {
    id: 'uuid-1',
    name: 'My Raitaru',
    structureTypeId: RAITARU,
    rigTypeIds: [RIG_A],
    systemId: null,
    taxPct: 1.5,
    ...overrides,
  };
}

function corp(overrides: Partial<CorpStructureInput> = {}): CorpStructureInput {
  return {
    structureId: 1035000000000,
    typeId: ATHANOR,
    name: 'Corp Athanor',
    rigTypeIds: [RIG_A, RIG_B],
    systemId: 30000142,
    securityClass: 'high',
    taxPct: 0.5,
    ...overrides,
  };
}

describe('collectDogmaTypeIds', () => {
  it('collects every structure + rig type once across both sources', () => {
    const ids = collectDogmaTypeIds([custom()], [corp()]);
    expect(ids.sort()).toEqual([RAITARU, ATHANOR, RIG_A, RIG_B].sort());
  });

  it('returns empty for no structures', () => {
    expect(collectDogmaTypeIds([], [])).toEqual([]);
  });
});

describe('buildAvailableStructures', () => {
  it('maps a custom structure with resolved dogma, null securityClass, and its pin', () => {
    const rows = buildAvailableStructures(
      [custom({ systemId: 30002187 })],
      [],
      STRUCTURE_TYPES,
      DOGMA,
    );
    expect(rows).toEqual([
      {
        id: 'uuid-1',
        source: 'custom',
        name: 'My Raitaru',
        structureTypeId: RAITARU,
        groupId: 1404,
        systemId: 30002187,
        structureAttrs: { '2600': 1 },
        rigAttrs: [{ '2593': -2 }],
        securityClass: null,
        taxPct: 1.5,
      },
    ]);
  });

  it('maps a corp structure with a namespaced id and its real system + security band', () => {
    const rows = buildAvailableStructures([], [corp()], STRUCTURE_TYPES, DOGMA);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'corp:1035000000000',
      source: 'corp',
      name: 'Corp Athanor',
      structureTypeId: ATHANOR,
      groupId: 1406,
      systemId: 30000142,
      securityClass: 'high',
      taxPct: 0.5,
    });
    // An un-doged rig resolves to an empty attrs object, never a hole.
    expect(rows[0].rigAttrs).toEqual([{ '2593': -2 }, {}]);
  });

  it('falls back a nameless corp structure to its type name', () => {
    // The final `Structure <id>` arm is defensive-only: knownTypeIds and the
    // name map derive from the same rows, so a row past the gate always has a
    // type name. Assert the reachable fallback.
    const [byType] = buildAvailableStructures([], [corp({ name: null })], STRUCTURE_TYPES, DOGMA);
    expect(byType.name).toBe('Athanor');
  });

  it('drops rows whose structure type is no longer a known industry structure (SDE drift)', () => {
    const rows = buildAvailableStructures(
      [custom({ structureTypeId: 99999 })],
      [corp({ typeId: 88888 })],
      STRUCTURE_TYPES,
      DOGMA,
    );
    expect(rows).toEqual([]);
  });

  it('resolves missing structure dogma to an empty attrs object', () => {
    const rows = buildAvailableStructures([custom()], [], STRUCTURE_TYPES, new Map());
    expect(rows[0].structureAttrs).toEqual({});
    expect(rows[0].rigAttrs).toEqual([{}]);
  });

  it('merges custom before corp, preserving each source order', () => {
    const rows = buildAvailableStructures(
      [custom(), custom({ id: 'uuid-2', name: 'Second' })],
      [corp()],
      STRUCTURE_TYPES,
      DOGMA,
    );
    expect(rows.map((r) => r.id)).toEqual(['uuid-1', 'uuid-2', 'corp:1035000000000']);
  });
});
