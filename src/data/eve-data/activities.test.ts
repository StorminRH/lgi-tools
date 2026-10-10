import { describe, expect, it } from 'vitest';
import {
  isBlueprintActivitiesDocument,
  parseBlueprintActivities,
  type BlueprintActivitySet,
} from './activities';
import { INV_683, MFG_681, RXN_46175 } from './__fixtures__/blueprint-activities';

const byName = (set: BlueprintActivitySet, name: string) =>
  set.find((a) => a.name === name);

function requireActivity(set: BlueprintActivitySet, name: string) {
  const activity = byName(set, name);
  expect(activity, name).toBeDefined();
  if (activity === undefined) throw new Error(`missing ${name} activity`);
  return activity;
}

function expectManufacturing681(): void {
  const mfgSet = parseBlueprintActivities(MFG_681);
  expect([...mfgSet.map((a) => a.name)].sort()).toEqual([
    'copying',
    'manufacturing',
    'research_material',
    'research_time',
  ]);
  expect(byName(mfgSet, 'invention')).toBeUndefined();
  const mfg = requireActivity(mfgSet, 'manufacturing');
  expect(mfg.activityId).toBe(1);
  expect(mfg.time).toBe(600);
  expect(mfg.materials).toEqual([{ typeId: 38, quantity: 86 }]);
  expect(mfg.products).toEqual([{ typeId: 165, quantity: 1 }]);
  expect(mfg.skills).toEqual([]);
  const copying = requireActivity(mfgSet, 'copying');
  expect(copying.activityId).toBe(5);
  expect(copying.time).toBe(480);
  expect(copying.materials).toEqual([]);
  expect(copying.products).toEqual([]);
  for (const act of mfgSet) {
    for (const p of act.products) expect(p.probability).toBeUndefined();
  }
}

function expectReaction46175(): void {
  const rxnSet = parseBlueprintActivities(RXN_46175);
  const rxn = requireActivity(rxnSet, 'reaction');
  expect(rxnSet.map((a) => a.name)).toEqual(['reaction']);
  expect(rxn.activityId).toBe(11);
  expect(rxn.time).toBe(10800);
  expect(rxn.skills).toEqual([{ typeId: 45746, level: 2 }]);
  expect(rxn.materials).toHaveLength(3);
  expect(rxn.products).toEqual([{ typeId: 16666, quantity: 200 }]);
  expect(rxn.products[0]?.probability).toBeUndefined();
}

function expectInvention683(): void {
  const invSet = parseBlueprintActivities(INV_683);
  const inv = requireActivity(invSet, 'invention');
  expect(inv.activityId).toBe(8);
  expect(inv.time).toBe(63900);
  expect(inv.materials).toEqual([
    { typeId: 20416, quantity: 2 },
    { typeId: 25887, quantity: 2 },
  ]);
  expect(inv.skills).toEqual([
    { typeId: 11442, level: 1 },
    { typeId: 11454, level: 1 },
    { typeId: 21790, level: 1 },
  ]);
  expect(inv.products).toEqual([{ typeId: 39581, quantity: 1, probability: 0.3 }]);
  const mfg = requireActivity(invSet, 'manufacturing');
  expect(mfg.products[0]?.probability).toBeUndefined();
  expect(mfg.skills).toEqual([{ typeId: 3380, level: 1 }]);
}

describe('parseBlueprintActivities — manufacturing, reaction, and invention', () => {
  it('reads 681 manufacturing IO, 46175 reaction, and 683 invention probability', () => {
    expectManufacturing681();
    expectReaction46175();
    expectInvention683();
  });
});

describe('parseBlueprintActivities — normalization & defensiveness', () => {
  it('renames CCP raw typeID → typeId on materials, products, and skills', () => {
    const inv = byName(parseBlueprintActivities(INV_683), 'invention');
    const samples = [inv?.materials[0], inv?.products[0], inv?.skills[0]];
    for (const s of samples) {
      expect(s).toHaveProperty('typeId');
      expect(s).not.toHaveProperty('typeID');
    }
  });

  it('returns [] for non-object / empty input', () => {
    expect(parseBlueprintActivities(null)).toEqual([]);
    expect(parseBlueprintActivities(undefined)).toEqual([]);
    expect(parseBlueprintActivities('nope')).toEqual([]);
    expect(parseBlueprintActivities({})).toEqual([]);
  });

  it('drops malformed IO entries without throwing', () => {
    const set = parseBlueprintActivities({
      manufacturing: {
        time: 'oops',
        materials: [
          { typeID: 'x', quantity: 5 },
          { typeID: 7 },
          null,
          { typeID: 7, quantity: 3 },
        ],
      },
    });
    const mfg = byName(set, 'manufacturing');
    expect(mfg?.materials).toEqual([{ typeId: 7, quantity: 3 }]);
    expect(mfg?.time).toBeNull();
  });
});

describe('isBlueprintActivitiesDocument', () => {
  it('accepts CCP documents and rejects any entry that breaks the stored shape', () => {
    for (const doc of [MFG_681, RXN_46175, INV_683, {}, { copying: {} }]) {
      expect(isBlueprintActivitiesDocument(doc)).toBe(true);
    }
    for (const notObject of [null, undefined, 'nope', 42, [MFG_681]]) {
      expect(isBlueprintActivitiesDocument(notObject)).toBe(false);
    }
    const malformed = [
      { manufacturing: null },
      { manufacturing: 'x' },
      { manufacturing: { materials: { typeID: 34, quantity: 1 } } },
      { manufacturing: { materials: [null] } },
      { manufacturing: { materials: [{ typeID: '34', quantity: 1 }] } },
      { manufacturing: { materials: [{ typeID: 34 }] } },
      { manufacturing: { materials: [{ typeID: 34, quantity: 1.5 }] } },
      { manufacturing: { products: [{ quantity: 1 }] } },
      { invention: { products: [{ typeID: 9, quantity: 1, probability: '0.3' }] } },
      { invention: { skills: [{ typeID: 3380 }] } },
      { manufacturing: { time: '600' } },
    ];
    for (const doc of malformed) {
      expect(isBlueprintActivitiesDocument({ copying: { time: 480 }, ...doc }), JSON.stringify(doc)).toBe(false);
    }
  });
});
