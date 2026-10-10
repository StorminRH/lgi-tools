import { describe, expect, it } from 'vitest';
import { ACTIVITY_NAME_TO_ID } from '@/data/eve-data/constants';
import type { StructureModifier } from './api-contract';
import {
  computeStructureBonus,
  headlineStructureBonus,
  isProductionActivity,
  MANUFACTURING_ACTIVITY,
  REACTION_ACTIVITY,
  type SecurityClass,
} from './structure-bonus';

// CCP's industry target filters.
const EQUIPMENT = 2;
const CHARGES = 4;
const COMPONENTS = 14;
const ADV_CAP_COMPONENTS = 15;
const BIOCHEMICAL = 17;
const COMPOSITE = 18;

type Activity = StructureModifier['activity'];
type Kind = StructureModifier['kind'];

/** A hull bonus: the multiplier itself, the same in every band. */
const hull = (kind: Kind, factor: number, activity: Activity = 'manufacturing'): StructureModifier => ({
  activity,
  kind,
  filterId: null,
  factor: { high: factor, low: factor, null: factor },
});

const ENGINEERING_BANDS = { high: 1, low: 1.9, null: 2.1 };
const THUKKER_BANDS = { high: 0.1, low: 1.9, null: 0.1 };
const REACTOR_BANDS = { high: 0, low: 1, null: 1.1 };

/** A rig bonus: its percentage scaled by each security band, aimed at one category. */
const rig = (
  kind: Kind,
  pct: number,
  filterId: number,
  bands = ENGINEERING_BANDS,
  activity: Activity = 'manufacturing',
): StructureModifier => ({
  activity,
  kind,
  filterId,
  factor: { high: 1 + (pct * bands.high) / 100, low: 1 + (pct * bands.low) / 100, null: 1 + (pct * bands.null) / 100 },
});

const RAITARU = [hull('material', 0.99), hull('time', 0.85), hull('cost', 0.97)];
const AZBEL = [hull('material', 0.99), hull('time', 0.8), hull('cost', 0.96)];
const SOTIYO = [hull('material', 0.99), hull('time', 0.7), hull('cost', 0.95)];
const TATARA = [hull('time', 0.75, 'reaction')];

const mfg = (modifiers: StructureModifier[], securityClass: SecurityClass, filterIds: number[] = []) =>
  computeStructureBonus({ modifiers, securityClass, activityId: MANUFACTURING_ACTIVITY, filterIds });
const reaction = (modifiers: StructureModifier[], securityClass: SecurityClass, filterIds: number[]) =>
  computeStructureBonus({ modifiers, securityClass, activityId: REACTION_ACTIVITY, filterIds });

describe('computeStructureBonus — hull role bonus', () => {
  it('reads the flat 1% material and tiered time/cost from each engineering complex', () => {
    const raitaru = mfg(RAITARU, 'null');
    expect(raitaru.me).toBeCloseTo(1, 6);
    expect(raitaru.te).toBeCloseTo(15, 6);
    expect(raitaru.costBonus).toBeCloseTo(3, 6);

    const sotiyo = mfg(SOTIYO, 'high');
    expect(sotiyo.me).toBeCloseTo(1, 6);
    expect(sotiyo.te).toBeCloseTo(30, 6);
    expect(sotiyo.costBonus).toBeCloseTo(5, 6);
  });

  it('gives nothing when the structure has no bonuses (a citadel, an NPC station)', () => {
    expect(mfg([], 'null')).toEqual({ me: 0, te: 0, costBonus: 0 });
  });
});

describe('computeStructureBonus — rigs reach only their own category', () => {
  const ammoRaitaru = [...RAITARU, rig('material', -2.4, CHARGES), rig('time', -24, CHARGES)];

  it('applies a rig to a job in its target category', () => {
    const { me, te } = mfg(ammoRaitaru, 'low', [CHARGES]);
    expect(me).toBeCloseTo((1 - 0.99 * (1 - 0.024 * 1.9)) * 100, 6);
    expect(te).toBeCloseTo((1 - 0.85 * (1 - 0.24 * 1.9)) * 100, 6);
  });

  it('leaves a job outside the rig category with the hull bonus alone', () => {
    expect(mfg(ammoRaitaru, 'low', [EQUIPMENT])).toEqual(mfg(RAITARU, 'low', [EQUIPMENT]));
    expect(mfg(ammoRaitaru, 'low', [])).toEqual(mfg(RAITARU, 'low', []));
  });

  it('matches the canonical Sotiyo + T2 ME rig (null) reduction', () => {
    expect(mfg([...SOTIYO, rig('material', -2.4, COMPONENTS)], 'null', [COMPONENTS]).me).toBeCloseTo(5.9896, 6);
  });

  it('multiplies several rigs that reach the same job as independent factors', () => {
    const twoRigs = [...AZBEL, rig('material', -2, EQUIPMENT), rig('material', -2, EQUIPMENT)];
    expect(mfg(twoRigs, 'null', [EQUIPMENT]).me).toBeCloseTo(9.141364, 5);
  });

  it('reads the Thukker capital-component bonus apart from its general one', () => {
    const thukker = [rig('material', -2, COMPONENTS, THUKKER_BANDS), rig('material', -3.7, ADV_CAP_COMPONENTS, THUKKER_BANDS)];
    expect(mfg(thukker, 'low', [COMPONENTS]).me).toBeCloseTo(3.8, 6);
    expect(mfg(thukker, 'low', [ADV_CAP_COMPONENTS]).me).toBeCloseTo(7.03, 6);
    expect(mfg(thukker, 'null', [ADV_CAP_COMPONENTS]).me).toBeCloseTo(0.37, 6);
  });
});

describe('computeStructureBonus — security scaling (rig only)', () => {
  const meRig = [...AZBEL, rig('material', -2, EQUIPMENT)];

  it('scales the rig bonus by sec class while the hull bonus stays fixed', () => {
    expect(mfg(meRig, 'high', [EQUIPMENT]).me).toBeCloseTo(2.98, 6);
    expect(mfg(meRig, 'low', [EQUIPMENT]).me).toBeCloseTo(4.762, 6);
    expect(mfg(meRig, 'null', [EQUIPMENT]).me).toBeCloseTo(5.158, 6);
  });

  it('treats wormhole space with the null-sec band', () => {
    expect(mfg(meRig, 'wormhole', [EQUIPMENT]).me).toBeCloseTo(mfg(meRig, 'null', [EQUIPMENT]).me, 9);
  });
});

describe('computeStructureBonus — reactions', () => {
  const reactorL = [
    rig('material', -2.4, COMPOSITE, REACTOR_BANDS, 'reaction'),
    rig('time', -24, COMPOSITE, REACTOR_BANDS, 'reaction'),
    rig('material', -2.4, BIOCHEMICAL, REACTOR_BANDS, 'reaction'),
    rig('time', -24, BIOCHEMICAL, REACTOR_BANDS, 'reaction'),
  ];

  it('stacks the Tatara reaction-time bonus with the reactor rig, and the rig cuts materials too', () => {
    const { me, te, costBonus } = reaction([...TATARA, ...reactorL], 'null', [COMPOSITE]);
    expect(me).toBeCloseTo(2.64, 6);
    expect(te).toBeCloseTo((1 - 0.75 * (1 - 0.24 * 1.1)) * 100, 6);
    expect(costBonus).toBe(0);
  });

  it('never applies manufacturing bonuses to a reaction', () => {
    expect(reaction([...RAITARU, ...TATARA], 'null', [COMPOSITE])).toEqual({ me: 0, te: 25, costBonus: 0 });
  });

  it('makes a reactor rig a no-op in high-sec, where it has no band', () => {
    expect(reaction([...TATARA, ...reactorL], 'high', [COMPOSITE])).toEqual({ me: 0, te: 25, costBonus: 0 });
  });
});

describe('headlineStructureBonus', () => {
  it('is the best any one category gets, metric by metric', () => {
    const split = [...RAITARU, rig('material', -2.4, EQUIPMENT), rig('time', -24, CHARGES)];
    const headline = headlineStructureBonus({ filterSets: [[EQUIPMENT], [CHARGES]], modifiers: split, securityClass: 'high', activityId: MANUFACTURING_ACTIVITY });
    expect(headline.me).toBeCloseTo(mfg(split, 'high', [EQUIPMENT]).me, 9);
    expect(headline.te).toBeCloseTo(mfg(split, 'high', [CHARGES]).te, 9);
    expect(headline.costBonus).toBeCloseTo(3, 6);
  });

  it('includes the overlapping basic and advanced medium ship filters for Odysseus on an Azbel', () => {
    const modifiers = [
      ...AZBEL,
      rig('material', -2.4, 7),
      rig('time', -24, 7),
      rig('material', -2.4, 8),
      rig('time', -24, 8),
    ];
    const headline = headlineStructureBonus({
      modifiers,
      securityClass: 'null',
      activityId: MANUFACTURING_ACTIVITY,
      filterSets: [[3, 7], [3, 8], [3, 7, 8]],
    });
    expect(headline.me).toBeCloseTo(10.72772416, 8);
    expect(headline.te).toBeCloseTo(80.31872, 8);
    expect(headline).toEqual(mfg(modifiers, 'null', [3, 7, 8]));
  });

  it('never stacks rigs whose targets no product matches together', () => {
    const modifiers = [...AZBEL, rig('material', -2.4, EQUIPMENT), rig('material', -2.4, CHARGES)];
    const headline = headlineStructureBonus({
      modifiers,
      securityClass: 'null',
      activityId: MANUFACTURING_ACTIVITY,
      filterSets: [[EQUIPMENT], [CHARGES]],
    });
    expect(headline.me).toBeCloseTo(5.9896, 8);
  });

  it('is the hull alone when no rig is fitted', () => {
    expect(headlineStructureBonus({ filterSets: [], modifiers: RAITARU, securityClass: 'null', activityId: MANUFACTURING_ACTIVITY })).toEqual(
      mfg(RAITARU, 'null'),
    );
  });
});

describe('computeStructureBonus — composes with blueprint ME (contract pin)', () => {
  const requiredQty = (baseQty: number, runs: number, bpMe: number, structureMe: number): number => {
    const modifier = (1 - bpMe / 100) * (1 - structureMe / 100);
    return Math.max(runs, Math.ceil(Math.round(runs * baseQty * modifier * 100) / 100));
  };
  const sotiyoT2 = [...SOTIYO, rig('material', -2.4, COMPONENTS)];

  it('stacks the structure ME on blueprint ME through the round-then-ceil', () => {
    const { me } = mfg(sotiyoT2, 'null', [COMPONENTS]);
    expect(requiredQty(100, 1, 10, me)).toBe(85);
    expect(requiredQty(100, 1, 10, 0)).toBe(90);
  });

  it('honours the ≥1-per-run floor under a heavy structure reduction', () => {
    const { me } = mfg([...sotiyoT2, rig('material', -2, COMPONENTS)], 'null', [COMPONENTS]);
    expect(requiredQty(1, 3, 10, me)).toBe(3);
  });
});

describe('isProductionActivity', () => {
  it('admits only the SDE manufacturing and reaction ids the planner prices', () => {
    expect(MANUFACTURING_ACTIVITY).toBe(ACTIVITY_NAME_TO_ID.manufacturing);
    expect(REACTION_ACTIVITY).toBe(ACTIVITY_NAME_TO_ID.reaction);
    expect(isProductionActivity(1)).toBe(true);
    expect(isProductionActivity(11)).toBe(true);
    for (const other of [9, 3, 4, 5, 8, 0, undefined, null]) expect(isProductionActivity(other)).toBe(false);
  });
});
