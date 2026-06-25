import { describe, expect, it } from 'vitest';
import { ACTIVITY_NAME_TO_ID, ALL_ACTIVITY_NAMES } from './constants';
import { parseBlueprintActivities, type BlueprintActivitySet } from './activities';
import { INV_683, MFG_681, RXN_46175 } from './__fixtures__/blueprint-activities';

const byName = (set: BlueprintActivitySet, name: string) =>
  set.find((a) => a.name === name);

describe('parseBlueprintActivities — manufacturing blueprint (681)', () => {
  const set = parseBlueprintActivities(MFG_681);

  it('exposes every present activity and no invention', () => {
    expect([...set.map((a) => a.name)].sort()).toEqual([
      'copying',
      'manufacturing',
      'research_material',
      'research_time',
    ]);
    expect(byName(set, 'invention')).toBeUndefined();
  });

  it('reads manufacturing IO + time with the correct activityId', () => {
    const mfg = byName(set, 'manufacturing');
    expect(mfg?.activityId).toBe(1);
    expect(mfg?.time).toBe(600);
    expect(mfg?.materials).toEqual([{ typeId: 38, quantity: 86 }]);
    expect(mfg?.products).toEqual([{ typeId: 165, quantity: 1 }]);
    expect(mfg?.skills).toEqual([]); // 681 manufacturing has no skill requirement
  });

  it('keeps time-only activities (copying/research) with empty IO', () => {
    const copying = byName(set, 'copying');
    expect(copying?.activityId).toBe(5);
    expect(copying?.time).toBe(480);
    expect(copying?.materials).toEqual([]);
    expect(copying?.products).toEqual([]);
    expect(copying?.skills).toEqual([]);
  });

  it('leaves probability absent on every product', () => {
    for (const act of set) {
      for (const p of act.products) expect(p.probability).toBeUndefined();
    }
  });
});

describe('parseBlueprintActivities — reaction blueprint (46175)', () => {
  const set = parseBlueprintActivities(RXN_46175);
  const rxn = byName(set, 'reaction');

  it('reads the reaction activity (id 11) with IO, skills, and time', () => {
    expect(set.map((a) => a.name)).toEqual(['reaction']);
    expect(rxn?.activityId).toBe(11);
    expect(rxn?.time).toBe(10800);
    expect(rxn?.skills).toEqual([{ typeId: 45746, level: 2 }]);
    expect(rxn?.materials).toHaveLength(3);
    expect(rxn?.products).toEqual([{ typeId: 16666, quantity: 200 }]);
  });

  it('leaves probability absent on the reaction product', () => {
    expect(rxn?.products[0]?.probability).toBeUndefined();
  });
});

describe('parseBlueprintActivities — invention blueprint (683)', () => {
  const set = parseBlueprintActivities(INV_683);
  const inv = byName(set, 'invention');

  it('reads the invention activity (id 8) with datacores, skills, and time', () => {
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
  });

  it('carries per-product probability on the invention output', () => {
    expect(inv?.products).toEqual([{ typeId: 39581, quantity: 1, probability: 0.3 }]);
    expect(inv?.products[0]?.probability).toBe(0.3);
  });

  it('still leaves probability absent on the same blueprint’s manufacturing output', () => {
    const mfg = byName(set, 'manufacturing');
    expect(mfg?.products[0]?.probability).toBeUndefined();
    expect(mfg?.skills).toEqual([{ typeId: 3380, level: 1 }]);
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

describe('activity-name constants do not drift', () => {
  it('ALL_ACTIVITY_NAMES and ACTIVITY_NAME_TO_ID cover exactly the same names', () => {
    expect([...ALL_ACTIVITY_NAMES].sort()).toEqual(
      Object.keys(ACTIVITY_NAME_TO_ID).sort(),
    );
  });
});
