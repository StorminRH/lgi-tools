import { describe, expect, it } from 'vitest';
import type { StructureModifier } from './api-contract';
import {
  buildAvailableStructures,
  collectModifierSourceTypeIds,
  type CorpStructureInput,
  type CustomStructureInput,
  type ModifierMap,
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

const flat = (f: number) => ({ high: f, low: f, null: f });
const RAITARU_MATERIAL: StructureModifier = { activity: 'manufacturing', kind: 'material', filterId: null, factor: flat(0.99) };
const RAITARU_TIME: StructureModifier = { activity: 'manufacturing', kind: 'time', filterId: null, factor: flat(0.85) };
const RIG_A_MATERIAL: StructureModifier = {
  activity: 'manufacturing',
  kind: 'material',
  filterId: 2,
  factor: { high: 0.98, low: 0.962, null: 0.958 },
};

// The Athanor hull and RIG_B carry no manufacturing bonus, so they have no entry.
const TARGET_FILTER_SETS = [[2], [3, 7, 8], [18]];

const MODIFIERS: ModifierMap = new Map([
  [RAITARU, [RAITARU_MATERIAL, RAITARU_TIME]],
  [RIG_A, [RIG_A_MATERIAL]],
]);

function custom(overrides: Partial<CustomStructureInput> = {}): CustomStructureInput {
  return {
    id: 'uuid-1',
    name: 'My Raitaru',
    structureTypeId: RAITARU,
    rigTypeIds: [RIG_A],
    systemId: null,
    taxPct: 1.5,
    bonuses: null,
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

describe('collectModifierSourceTypeIds', () => {
  it('collects every hull + rig type once across both sources', () => {
    const ids = collectModifierSourceTypeIds([custom()], [corp(), corp({ structureId: 2 })]);
    expect(ids.sort()).toEqual([RAITARU, ATHANOR, RIG_A, RIG_B].sort());
  });

  it('returns empty for no structures', () => {
    expect(collectModifierSourceTypeIds([], [])).toEqual([]);
  });
});

describe('buildAvailableStructures', () => {
  it('maps a custom structure with its hull then rig modifiers, null securityClass, and its pin', () => {
    const rows = buildAvailableStructures(
      [custom({ systemId: 30002187 })],
      [],
      STRUCTURE_TYPES,
      MODIFIERS,
      TARGET_FILTER_SETS,
    );
    expect(rows).toEqual([
      {
        id: 'uuid-1',
        source: 'custom',
        name: 'My Raitaru',
        structureTypeId: RAITARU,
        groupId: 1404,
        systemId: 30002187,
        targetFilterSets: TARGET_FILTER_SETS,
        modifiers: [RAITARU_MATERIAL, RAITARU_TIME, RIG_A_MATERIAL],
        securityClass: null,
        taxPct: 1.5,
        enteredBonuses: null,
      },
    ]);
  });

  it('carries typed-in bonuses on a custom row and never on a corp row', () => {
    const bonuses = { manufacturing: { me: 3.38, te: 39.2, cost: 4 }, reactions: { me: 0, te: 0 } };
    const rows = buildAvailableStructures(
      [custom({ rigTypeIds: [], bonuses })],
      [corp()],
      STRUCTURE_TYPES,
      MODIFIERS,
      TARGET_FILTER_SETS,
    );
    expect(rows.map((r) => r.enteredBonuses)).toEqual([bonuses, null]);
  });

  it('maps a corp structure with a namespaced id and its real system + security band', () => {
    const rows = buildAvailableStructures([], [corp()], STRUCTURE_TYPES, MODIFIERS, TARGET_FILTER_SETS);
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
    expect(rows[0]!.modifiers).toEqual([RIG_A_MATERIAL]);
    expect(rows[0]!.targetFilterSets).toEqual(TARGET_FILTER_SETS);
  });

  it('falls back a nameless corp structure to its type name', () => {
    const [byType] = buildAvailableStructures([], [corp({ name: null })], STRUCTURE_TYPES, MODIFIERS, TARGET_FILTER_SETS);
    expect(byType!.name).toBe('Athanor');
  });

  it('drops rows whose structure type is no longer a known industry structure (SDE drift)', () => {
    const rows = buildAvailableStructures(
      [custom({ structureTypeId: 99999 })],
      [corp({ typeId: 88888 })],
      STRUCTURE_TYPES,
      MODIFIERS,
      TARGET_FILTER_SETS,
    );
    expect(rows).toEqual([]);
  });

  it('resolves a structure whose hull and rigs carry no modifiers to an empty list', () => {
    const rows = buildAvailableStructures([custom()], [], STRUCTURE_TYPES, new Map(), TARGET_FILTER_SETS);
    expect(rows[0]!.modifiers).toEqual([]);
  });

  it('keeps each structure to its own fitted rigs', () => {
    const rows = buildAvailableStructures(
      [custom(), custom({ id: 'uuid-2', rigTypeIds: [] })],
      [],
      STRUCTURE_TYPES,
      MODIFIERS,
      TARGET_FILTER_SETS,
    );
    expect(rows.map((r) => r.modifiers)).toEqual([
      [RAITARU_MATERIAL, RAITARU_TIME, RIG_A_MATERIAL],
      [RAITARU_MATERIAL, RAITARU_TIME],
    ]);
  });

  it('merges custom before corp, preserving each source order', () => {
    const rows = buildAvailableStructures(
      [custom(), custom({ id: 'uuid-2', name: 'Second' })],
      [corp()],
      STRUCTURE_TYPES,
      MODIFIERS,
      TARGET_FILTER_SETS,
    );
    expect(rows.map((r) => r.id)).toEqual(['uuid-1', 'uuid-2', 'corp:1035000000000']);
  });
});
