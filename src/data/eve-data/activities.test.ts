import { describe, expect, it } from 'vitest';
import { parseBlueprintActivities, type BlueprintActivitySet } from './activities';
import { INV_683, MFG_681, RXN_46175 } from './__fixtures__/blueprint-activities';

const byName = (set: BlueprintActivitySet, name: string) =>
  set.find((a) => a.name === name);

describe('parseBlueprintActivities — manufacturing, reaction, and invention', () => {
  it('reads 681 manufacturing IO, 46175 reaction, and 683 invention probability', () => {
    const mfgSet = parseBlueprintActivities(MFG_681);
    expect([...mfgSet.map((a) => a.name)].sort()).toEqual([
      'copying',
      'manufacturing',
      'research_material',
      'research_time',
    ]);
    expect(byName(mfgSet, 'invention')).toBeUndefined();
    const mfg = byName(mfgSet, 'manufacturing');
    expect(mfg?.activityId).toBe(1);
    expect(mfg?.time).toBe(600);
    expect(mfg?.materials).toEqual([{ typeId: 38, quantity: 86 }]);
    expect(mfg?.products).toEqual([{ typeId: 165, quantity: 1 }]);
    expect(mfg?.skills).toEqual([]);
    const copying = byName(mfgSet, 'copying');
    expect(copying?.activityId).toBe(5);
    expect(copying?.time).toBe(480);
    expect(copying?.materials).toEqual([]);
    expect(copying?.products).toEqual([]);
    for (const act of mfgSet) {
      for (const p of act.products) expect(p.probability).toBeUndefined();
    }

    const rxnSet = parseBlueprintActivities(RXN_46175);
    const rxn = byName(rxnSet, 'reaction');
    expect(rxnSet.map((a) => a.name)).toEqual(['reaction']);
    expect(rxn?.activityId).toBe(11);
    expect(rxn?.time).toBe(10800);
    expect(rxn?.skills).toEqual([{ typeId: 45746, level: 2 }]);
    expect(rxn?.materials).toHaveLength(3);
    expect(rxn?.products).toEqual([{ typeId: 16666, quantity: 200 }]);
    expect(rxn?.products[0]?.probability).toBeUndefined();

    const invSet = parseBlueprintActivities(INV_683);
    const inv = byName(invSet, 'invention');
    expect(inv?.activityId).toBe(8);
    expect(inv?.time).toBe(63900);
    expect(inv?.materials).toEqual([
      { typeId: 20416, quantity: 2 },
      { typeId: 25887, quantity: 2 },
    ]);
    expect(inv?.skills).toEqual([
      { typeId: 11442, level: 1 },
      { typeId: 11454, level: 1 },
      { typeId: 21790, level: 1 },
    ]);
    expect(inv?.products).toEqual([{ typeId: 39581, quantity: 1, probability: 0.3 }]);
    expect(byName(invSet, 'manufacturing')?.products[0]?.probability).toBeUndefined();
    expect(byName(invSet, 'manufacturing')?.skills).toEqual([{ typeId: 3380, level: 1 }]);
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
          { typeID: 'x', quantity: 5 }, // bad typeId
          { typeID: 7 }, // missing quantity
          null, // not an object
          { typeID: 7, quantity: 3 }, // the one valid row
        ],
      },
    });
    const mfg = byName(set, 'manufacturing');
    expect(mfg?.materials).toEqual([{ typeId: 7, quantity: 3 }]);
    expect(mfg?.time).toBeNull(); // non-numeric time coerces to null
  });
});
