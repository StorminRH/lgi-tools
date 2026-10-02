import { describe, expect, it } from 'vitest';
import {
  parseAssemblyLine,
  parseInstallationType,
  parseTargetFilter,
  resolveModifiers,
  type EffectModifier,
  type SourceDogma,
} from './industry-rules';

const POST_PERCENT = 6;
const POST_MULTIPLY = 4;
const SECURITY_MODIFIER = 2358;

const dogma = (attributes: Record<number, number>, effectIds: number[] = []): SourceDogma => ({
  attributes: new Map(Object.entries(attributes).map(([k, v]) => [Number(k), v])),
  effectIds,
});

// Effects as CCP ships them: a rig writes its percentage onto the structure's
// multiplier, and a security effect scales that percentage by the band.
const EFFECTS = new Map<number, EffectModifier[]>([
  [6805, [{ modifiedAttributeId: 2538, modifyingAttributeId: 2594, operation: POST_PERCENT }]],
  [6806, [{ modifiedAttributeId: 2539, modifyingAttributeId: 2593, operation: POST_PERCENT }]],
  [6824, [{ modifiedAttributeId: 2557, modifyingAttributeId: 2594, operation: POST_PERCENT }]],
  [6890, [{ modifiedAttributeId: 2658, modifyingAttributeId: 2653, operation: POST_PERCENT }]],
  [6975, [{ modifiedAttributeId: 2720, modifyingAttributeId: 2714, operation: POST_PERCENT }]],
  [
    6842,
    [2595, 2594, 2593, 2653].map((id) => ({
      modifiedAttributeId: id,
      modifyingAttributeId: SECURITY_MODIFIER,
      operation: POST_MULTIPLY,
    })),
  ],
  [
    6976,
    [2714, 2713].map((id) => ({ modifiedAttributeId: id, modifyingAttributeId: SECURITY_MODIFIER, operation: POST_MULTIPLY })),
  ],
]);

const RAITARU = 35825;
const L_EQUIPMENT_T2 = 37171;
const M_THUKKER_ADV_COMPONENT = 45640;
const M_BIOCHEMICAL_ME_T1 = 46494;

const DOGMA = new Map<number, SourceDogma>([
  [RAITARU, dogma({ 2600: 0.99, 2601: 0.97, 2602: 0.85 })],
  [L_EQUIPMENT_T2, dogma({ 2355: 1, 2356: 1.9, 2357: 2.1, 2593: -24, 2594: -2.4 }, [6805, 6806, 6842])],
  [M_THUKKER_ADV_COMPONENT, dogma({ 2355: 0.1, 2356: 1.9, 2357: 0.1, 2594: -2, 2653: -3.7 }, [6824, 6842, 6890])],
  [M_BIOCHEMICAL_ME_T1, dogma({ 2356: 1, 2357: 1.1, 2714: -2 }, [6975, 6976])],
]);

function resolve(sources: Record<string, unknown>[]) {
  return resolveModifiers(sources, EFFECTS, DOGMA);
}

describe('resolveModifiers', () => {
  it('takes a hull bonus as the multiplier it carries, the same in every band', () => {
    const { rows } = resolve([
      { _key: RAITARU, manufacturing: { material: [{ dogmaAttributeID: 2600 }], cost: [{ dogmaAttributeID: 2601 }] } },
    ]);
    expect(rows).toEqual([
      { sourceTypeId: RAITARU, activity: 'manufacturing', kind: 'material', attributeId: 2600, filterId: null, factorHigh: 0.99, factorLow: 0.99, factorNull: 0.99 },
      { sourceTypeId: RAITARU, activity: 'manufacturing', kind: 'cost', attributeId: 2601, filterId: null, factorHigh: 0.97, factorLow: 0.97, factorNull: 0.97 },
    ]);
  });

  it('scales a rig percentage by its security band and keeps its target filter', () => {
    const { rows } = resolve([
      { _key: L_EQUIPMENT_T2, manufacturing: { material: [{ dogmaAttributeID: 2538, filterID: 2 }] } },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'material', filterId: 2 });
    expect(rows[0]!.factorHigh).toBeCloseTo(0.976);
    expect(rows[0]!.factorLow).toBeCloseTo(1 - 0.024 * 1.9);
    expect(rows[0]!.factorNull).toBeCloseTo(1 - 0.024 * 2.1);
  });

  it('reads a Thukker rig from the attribute each effect names, not the usual one', () => {
    const { rows } = resolve([
      {
        _key: M_THUKKER_ADV_COMPONENT,
        manufacturing: { material: [{ dogmaAttributeID: 2557, filterID: 14 }, { dogmaAttributeID: 2658, filterID: 15 }] },
      },
    ]);
    expect(rows.map((r) => [r.filterId, Number(r.factorLow.toFixed(4))])).toEqual([
      [14, Number((1 - 0.02 * 1.9).toFixed(4))],
      [15, Number((1 - 0.037 * 1.9).toFixed(4))],
    ]);
    expect(rows[1]!.factorHigh).toBeCloseTo(1 - 0.037 * 0.1);
  });

  it('gives a reactor rig nothing in high-sec, where it has no band', () => {
    const { rows } = resolve([
      { _key: M_BIOCHEMICAL_ME_T1, reaction: { material: [{ dogmaAttributeID: 2720, filterID: 17 }] } },
    ]);
    expect(rows[0]).toMatchObject({ activity: 'reaction', kind: 'material', filterId: 17, factorHigh: 1 });
    expect(rows[0]!.factorNull).toBeCloseTo(1 - 0.02 * 1.1);
  });

  it('counts entries it cannot resolve instead of guessing', () => {
    const { rows, unresolved } = resolve([
      { _key: RAITARU, manufacturing: { time: [{ dogmaAttributeID: 9999 }] } },
      { _key: 1, manufacturing: { time: [{ dogmaAttributeID: 2602 }] } },
    ]);
    expect(rows).toEqual([]);
    expect(unresolved).toBe(2);
  });
});

describe('industry rule parsers', () => {
  it('parses a target filter with categories, groups or both', () => {
    expect(parseTargetFilter({ _key: 8, name: 'Medium T2 Ships', categoryIDs: [32], groupIDs: [358, 894] })).toEqual({
      id: 8,
      name: 'Medium T2 Ships',
      categoryIds: [32],
      groupIds: [358, 894],
    });
    expect(parseTargetFilter({ _key: 4, name: 'Charges', categoryIDs: [8] })).toMatchObject({ groupIds: [] });
    expect(parseTargetFilter({ _key: 9 })).toBeNull();
  });

  it('parses an assembly line into what it can build', () => {
    expect(
      parseAssemblyLine({
        _key: 175,
        activityID: 1,
        name: 'Standup Manufacturing Plant',
        detailsPerCategory: [{ categoryID: 7, timeMultiplier: 1 }],
        detailsPerGroup: [{ groupID: 513 }],
        detailsPerTypeList: [{ typeListID: 42 }],
      }),
    ).toEqual({ id: 175, name: 'Standup Manufacturing Plant', activityId: 1, categoryIds: [7], groupIds: [513], typeListIds: [42] });
    expect(parseAssemblyLine({ _key: 2, name: 'Lab Slot' })).toBeNull();
  });

  it('parses an installation into its assembly lines', () => {
    expect(parseInstallationType({ _key: 35878, assemblyLines: [{ assemblyLineID: 175 }, { assemblyLineID: 176 }] })).toEqual({
      typeId: 35878,
      assemblyLineIds: [175, 176],
    });
    expect(parseInstallationType({})).toBeNull();
  });
});
