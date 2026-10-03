import { describe, expect, it } from 'vitest';
import {
  SDE_CITADEL_GROUP_ID,
  SDE_ENGINEERING_COMPLEX_GROUP_ID,
  SDE_REFINERY_GROUP_ID,
} from '@/data/eve-data/constants';
import type { StructureModifier } from './api-contract';
import type { AvailableStructure } from './types';
import { MANUFACTURING_ACTIVITY, REACTION_ACTIVITY } from './structure-bonus';
import {
  composeFeeInputs,
  hostsReactions,
  structureFactorsFor,
  structureBonusesAt,
  structureReadouts,
} from './structure-factors';

const make = (over: Partial<AvailableStructure>): AvailableStructure => ({
  id: 's',
  source: 'custom',
  name: 'Structure',
  structureTypeId: 0,
  groupId: SDE_ENGINEERING_COMPLEX_GROUP_ID,
  systemId: null,
  targetFilterSets: [[2], [14], [17], [18]],
  modifiers: [],
  enteredBonuses: null,
  securityClass: null,
  taxPct: null,
  ...over,
});
const ec = (over: Partial<AvailableStructure>) =>
  make({ id: 'ec', name: 'Azbel', groupId: SDE_ENGINEERING_COMPLEX_GROUP_ID, ...over });
const refinery = (over: Partial<AvailableStructure>) =>
  make({ id: 'rf', name: 'Tatara', groupId: SDE_REFINERY_GROUP_ID, ...over });
const citadel = (over: Partial<AvailableStructure>) =>
  make({ id: 'ct', name: 'Fortizar', groupId: SDE_CITADEL_GROUP_ID, ...over });

// CCP's industry target filters.
const EQUIPMENT = 2;
const COMPONENTS = 14;
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

const EC_HULL = [hull('material', 0.95), hull('time', 0.9), hull('cost', 0.96)];
const TATARA_HULL = [hull('time', 0.75, 'reaction')];
// −2% material and −20% time on equipment jobs.
const ME_RIG = [rig('material', -2, EQUIPMENT), rig('time', -20, EQUIPMENT)];
// −20% time on composite reactions.
const REACTOR_RIG = [rig('time', -20, COMPOSITE, REACTOR_BANDS, 'reaction')];

// Blueprint 100 makes equipment and is the top job; blueprint 200 is a composite reaction.
const BUILD = {
  nodeActivityByBlueprint: { 100: MANUFACTURING_ACTIVITY, 200: REACTION_ACTIVITY },
  nodeFilterIds: { 100: [EQUIPMENT], 200: [COMPOSITE] },
  topBlueprintTypeId: 100,
};

describe('structureFactorsFor — activity mapping of the one selected structure', () => {
  it('applies an EC bonus to manufacturing nodes only; reaction nodes are untouched', () => {
    const f = structureFactorsFor({
      selectedStructure: ec({ modifiers: EC_HULL }),
      locationSecurity: 0.0,
      ...BUILD,
    });
    expect(f.active).toBe(true);
    expect(f.structureMeFactorOf(100)).toBeCloseTo(0.95, 6);
    expect(f.structureMeFactorOf(200)).toBe(1);
    expect(f.structureTeFactorOf(100)).toBeCloseTo(0.9, 6);
    expect(f.structureTeFactorOf(200)).toBe(1);
    expect(f.structureCostBonusPct).toBeCloseTo(4, 6);
  });

  it('applies a Refinery time bonus to reaction nodes; the hull gives reactions no material bonus', () => {
    const f = structureFactorsFor({
      selectedStructure: refinery({ modifiers: TATARA_HULL }),
      locationSecurity: 0.0,
      ...BUILD,
    });
    expect(f.structureTeFactorOf(200)).toBeCloseTo(0.75, 6);
    expect(f.structureMeFactorOf(200)).toBe(1);
    expect(f.structureTeFactorOf(100)).toBe(1);
    expect(f.structureCostBonusPct).toBe(0);
  });

  it('a Citadel + a manufacturing rig bonuses manufacturing nodes (rig only, no role)', () => {
    const f = structureFactorsFor({
      selectedStructure: citadel({ modifiers: ME_RIG }),
      locationSecurity: 0.5,
      ...BUILD,
    });
    expect(f.active).toBe(true);
    expect(f.structureMeFactorOf(100)).toBeCloseTo(0.98, 6);
    expect(f.structureTeFactorOf(100)).toBeCloseTo(0.8, 6);
    expect(f.structureCostBonusPct).toBe(0);
    expect(f.structureMeFactorOf(200)).toBe(1);
    expect(f.structureTeFactorOf(200)).toBe(1);
    expect(f.reactionBonus?.te ?? 0).toBe(0);
  });

  it('one Tatara fitted with both a mfg rig and a reaction rig bonuses BOTH node types', () => {
    const f = structureFactorsFor({
      selectedStructure: refinery({ modifiers: [...TATARA_HULL, ...ME_RIG, ...REACTOR_RIG] }),
      locationSecurity: 0.0,
      ...BUILD,
    });
    expect(f.active).toBe(true);
    expect(f.structureMeFactorOf(100)).toBeCloseTo(0.958, 6);
    expect(f.structureTeFactorOf(100)).toBeCloseTo(0.58, 6);
    expect(f.structureTeFactorOf(200)).toBeCloseTo(0.585, 6);
    expect(f.structureMeFactorOf(200)).toBe(1);
    expect(f.manufacturingBonus).not.toBeNull();
    expect(f.reactionBonus).not.toBeNull();
  });

  it('no structure selected → NO_STRUCTURE_FACTORS (the byte-identical anchor)', () => {
    const f = structureFactorsFor({
      selectedStructure: null,
      locationSecurity: 0.0,
      ...BUILD,
    });
    expect(f.active).toBe(false);
    expect(f.manufacturingBonus).toBeNull();
    expect(f.reactionBonus).toBeNull();
    expect(f.structureMeFactorOf(100)).toBe(1);
    expect(f.structureTeFactorOf(100)).toBe(1);
    expect(f.structureTeFactorOf(200)).toBe(1);
    expect(f.structureCostBonusPct).toBe(0);
  });

  it('a custom structure with no build system picked is inactive (byte-identical)', () => {
    const f = structureFactorsFor({
      selectedStructure: ec({ modifiers: [hull('material', 0.95)] }),
      locationSecurity: null,
      ...BUILD,
    });
    expect(f.active).toBe(false);
    expect(f.manufacturingBonus).toBeNull();
    expect(f.reactionBonus).toBeNull();
    expect(f.structureMeFactorOf(100)).toBe(1);
    expect(f.structureCostBonusPct).toBe(0);
  });

  it('a corp structure carries its own security, so it is active with no build location', () => {
    const f = structureFactorsFor({
      selectedStructure: ec({ source: 'corp', securityClass: 'null', modifiers: [hull('material', 0.95)] }),
      locationSecurity: null,
      ...BUILD,
    });
    expect(f.active).toBe(true);
    expect(f.structureMeFactorOf(100)).toBeCloseTo(0.95, 6);
  });
});

describe('structureFactorsFor — security from the build system scales rigs', () => {
  const withMeRig = ec({ modifiers: [hull('material', 0.99), ...ME_RIG] });

  it('null-sec applies the strongest rig multiplier (2.1)', () => {
    const f = structureFactorsFor({
      selectedStructure: withMeRig,
      locationSecurity: 0.0,
      ...BUILD,
    });
    expect(f.structureMeFactorOf(100)).toBeCloseTo(0.94842, 6);
  });

  it('high-sec applies the weakest rig multiplier (1.0) — same structure, different system', () => {
    const f = structureFactorsFor({
      selectedStructure: withMeRig,
      locationSecurity: 0.5,
      ...BUILD,
    });
    expect(f.structureMeFactorOf(100)).toBeCloseTo(0.9702, 6);
  });

  it('bans a reaction rig in high-sec (its high-sec band is zero) — only the hull bonus applies', () => {
    const sel = refinery({ modifiers: [...TATARA_HULL, ...REACTOR_RIG] });
    const hi = structureFactorsFor({ selectedStructure: sel, locationSecurity: 0.5, ...BUILD });
    const nul = structureFactorsFor({ selectedStructure: sel, locationSecurity: 0.0, ...BUILD });
    expect(hi.structureTeFactorOf(200)).toBeCloseTo(0.75, 6);
    expect(nul.structureTeFactorOf(200)).toBeCloseTo(0.585, 6);
  });
});

describe('structureFactorsFor — rigs reach only the jobs in their category', () => {
  // Blueprint 100 makes equipment (the rig's category); blueprint 300 makes a component (outside it).
  const nodeActivityByBlueprint = { 100: MANUFACTURING_ACTIVITY, 300: MANUFACTURING_ACTIVITY };
  const nodeFilterIds = { 100: [EQUIPMENT], 300: [COMPONENTS] };
  const equipmentEc = ec({ modifiers: [...EC_HULL, ...ME_RIG] });
  const factorsFor = (selectedStructure: AvailableStructure, topBlueprintTypeId: number) =>
    structureFactorsFor({ selectedStructure, locationSecurity: 0.0, nodeActivityByBlueprint, nodeFilterIds, topBlueprintTypeId });

  it('stacks the rig on the hull for a job in its category; a job outside it gets the hull alone', () => {
    const f = factorsFor(equipmentEc, 100);
    expect(f.structureMeFactorOf(100)).toBeCloseTo(0.95 * 0.958, 6);
    expect(f.structureTeFactorOf(100)).toBeCloseTo(0.9 * 0.58, 6);
    expect(f.structureMeFactorOf(300)).toBeCloseTo(0.95, 6);
    expect(f.structureTeFactorOf(300)).toBeCloseTo(0.9, 6);
  });

  it('gives a job whose product no filter targets the hull alone', () => {
    const f = structureFactorsFor({
      selectedStructure: equipmentEc,
      locationSecurity: 0.0,
      nodeActivityByBlueprint: { 400: MANUFACTURING_ACTIVITY },
      nodeFilterIds: {},
      topBlueprintTypeId: 400,
    });
    expect(f.structureMeFactorOf(400)).toBeCloseTo(0.95, 6);
    expect(f.structureTeFactorOf(400)).toBeCloseTo(0.9, 6);
  });

  it('reads the build as the best any of its jobs gets, whichever job is on top', () => {
    const f = factorsFor(equipmentEc, 300);
    expect(f.manufacturingBonus?.me).toBeCloseTo((1 - 0.95 * 0.958) * 100, 6);
    expect(f.manufacturingBonus?.te).toBeCloseTo((1 - 0.9 * 0.58) * 100, 6);
    expect(f.manufacturingBonus?.costBonus).toBeCloseTo(4, 6);
  });

  it('reads a build with no job in the rig category as the hull alone', () => {
    const f = structureFactorsFor({
      selectedStructure: equipmentEc,
      locationSecurity: 0.0,
      nodeActivityByBlueprint: { 300: MANUFACTURING_ACTIVITY },
      nodeFilterIds: { 300: [COMPONENTS] },
      topBlueprintTypeId: 300,
    });
    expect(f.manufacturingBonus?.me).toBeCloseTo(5, 6);
    expect(f.manufacturingBonus?.te).toBeCloseTo(10, 6);
    expect(f.manufacturingBonus?.costBonus).toBeCloseTo(4, 6);
  });

  it("takes the job cost bonus from the top blueprint's job, not the build's best", () => {
    // A cost bonus aimed at one category: CCP's own cost bonuses are all hull-wide today.
    const costRigged = ec({ modifiers: [...EC_HULL, rig('cost', -10, EQUIPMENT)] });
    const rigged = (1 - 0.96 * 0.79) * 100;
    expect(factorsFor(costRigged, 100).structureCostBonusPct).toBeCloseTo(rigged, 6);
    expect(factorsFor(costRigged, 300).structureCostBonusPct).toBeCloseTo(4, 6);
    expect(factorsFor(costRigged, 300).manufacturingBonus?.costBonus).toBeCloseTo(rigged, 6);
  });

  it('gives a reaction on top no job cost bonus, whatever the manufacturing hull gives', () => {
    const f = structureFactorsFor({
      selectedStructure: ec({ modifiers: EC_HULL }),
      locationSecurity: 0.0,
      reactionStructure: refinery({ id: 'rf-b', modifiers: TATARA_HULL }),
      reactionSecurity: 0.0,
      ...BUILD,
      topBlueprintTypeId: 200,
    });
    expect(f.manufacturingBonus?.costBonus).toBeCloseTo(4, 6);
    expect(f.structureCostBonusPct).toBe(0);
  });

  it('reads a slot with no job of its activity in the build as the structure best category', () => {
    const f = structureFactorsFor({
      selectedStructure: ec({ modifiers: [...EC_HULL, rig('material', -2, EQUIPMENT)] }),
      locationSecurity: 0.0,
      nodeActivityByBlueprint: { 200: REACTION_ACTIVITY },
      nodeFilterIds: { 200: [COMPOSITE] },
      topBlueprintTypeId: 200,
    });
    expect(f.active).toBe(true);
    expect(f.manufacturingBonus?.me).toBeCloseTo((1 - 0.95 * (1 - 0.02 * 2.1)) * 100, 6);
    expect(f.structureMeFactorOf(200)).toBe(1);
  });
});

describe('structureFactorsFor — reactor rigs cut reaction materials in their category', () => {
  // −2.4% material and −24% time on composite reactions.
  const compositeReactor = [
    rig('material', -2.4, COMPOSITE, REACTOR_BANDS, 'reaction'),
    rig('time', -24, COMPOSITE, REACTOR_BANDS, 'reaction'),
  ];
  // Blueprint 200 is a composite reaction (the rig's category); blueprint 210 is a biochemical one.
  const build = {
    nodeActivityByBlueprint: { 100: MANUFACTURING_ACTIVITY, 200: REACTION_ACTIVITY, 210: REACTION_ACTIVITY },
    nodeFilterIds: { 100: [EQUIPMENT], 200: [COMPOSITE], 210: [BIOCHEMICAL] },
    topBlueprintTypeId: 100,
  };
  const tatara = refinery({ modifiers: [...TATARA_HULL, ...compositeReactor] });

  it('stacks the rig on the hull for a reaction in its category; other reactions get the hull alone', () => {
    const f = structureFactorsFor({ selectedStructure: tatara, locationSecurity: 0.0, ...build });
    expect(f.structureMeFactorOf(200)).toBeCloseTo(1 - 0.024 * 1.1, 6);
    expect(f.structureTeFactorOf(200)).toBeCloseTo(0.75 * (1 - 0.24 * 1.1), 6);
    expect(f.structureMeFactorOf(210)).toBe(1);
    expect(f.structureTeFactorOf(210)).toBeCloseTo(0.75, 6);
    expect(f.reactionBonus?.me).toBeCloseTo(2.64, 6);
  });

  it('never reaches a manufacturing job', () => {
    const f = structureFactorsFor({ selectedStructure: tatara, locationSecurity: 0.0, ...build });
    expect(f.structureMeFactorOf(100)).toBe(1);
    expect(f.structureTeFactorOf(100)).toBe(1);
  });

  it('cuts nothing in high-sec, where the rig has no band', () => {
    const f = structureFactorsFor({ selectedStructure: tatara, locationSecurity: 0.5, ...build });
    expect(f.structureMeFactorOf(200)).toBe(1);
    expect(f.reactionBonus?.me).toBe(0);
  });
});

describe('coverage — hostsReactions', () => {
  it('only a Refinery (1406) hosts reactions', () => {
    expect(hostsReactions(SDE_REFINERY_GROUP_ID)).toBe(true);
    expect(hostsReactions(SDE_ENGINEERING_COMPLEX_GROUP_ID)).toBe(false);
    expect(hostsReactions(SDE_CITADEL_GROUP_ID)).toBe(false);
  });
});

describe('structureFactorsFor — smart two-structure routing', () => {
  const ecBuild = ec({ modifiers: EC_HULL });
  const reactionRefinery = refinery({ id: 'rf-b', modifiers: TATARA_HULL });

  it('is byte-identical to the single-structure path when no reaction refinery is given', () => {
    for (const build of [ecBuild, refinery({ modifiers: TATARA_HULL }), citadel({ modifiers: ME_RIG })]) {
      const base = { selectedStructure: build, locationSecurity: 0.0, ...BUILD };
      const omitted = structureFactorsFor(base);
      const explicitNull = structureFactorsFor({ ...base, reactionStructure: null, reactionSecurity: null });
      expect(omitted.structureMeFactorOf(100)).toBe(explicitNull.structureMeFactorOf(100));
      expect(omitted.structureTeFactorOf(100)).toBe(explicitNull.structureTeFactorOf(100));
      expect(omitted.structureTeFactorOf(200)).toBe(explicitNull.structureTeFactorOf(200));
      expect(omitted.structureCostBonusPct).toBe(explicitNull.structureCostBonusPct);
    }
  });

  it('routes manufacturing to the build structure and reactions to the refinery (each fed by one)', () => {
    const f = structureFactorsFor({
      selectedStructure: ecBuild,
      locationSecurity: 0.0,
      reactionStructure: reactionRefinery,
      reactionSecurity: 0.0,
      ...BUILD,
    });
    expect(f.structureMeFactorOf(100)).toBeCloseTo(0.95, 6);
    expect(f.structureTeFactorOf(100)).toBeCloseTo(0.9, 6);
    expect(f.structureTeFactorOf(200)).toBeCloseTo(0.75, 6);
    expect(f.structureMeFactorOf(200)).toBe(1);
    expect(f.structureCostBonusPct).toBeCloseTo(4, 6);
  });

  it('a lone refinery does the WHOLE chain (reactions AND manufacturing), in either slot', () => {
    const lone = refinery({ modifiers: [...TATARA_HULL, ...ME_RIG] });
    const asBuild = structureFactorsFor({
      selectedStructure: lone,
      locationSecurity: 0.0,
      ...BUILD,
    });
    expect(asBuild.structureMeFactorOf(100)).toBeCloseTo(0.958, 6);
    expect(asBuild.structureTeFactorOf(200)).toBeCloseTo(0.75, 6);
    const asReaction = structureFactorsFor({
      selectedStructure: null,
      locationSecurity: null,
      reactionStructure: lone,
      reactionSecurity: 0.0,
      ...BUILD,
    });
    expect(asReaction.structureMeFactorOf(100)).toBeCloseTo(0.958, 6);
    expect(asReaction.structureTeFactorOf(200)).toBeCloseTo(0.75, 6);
  });

  it("scales the refinery's reaction rig against the refinery's OWN system security", () => {
    const f = structureFactorsFor({
      selectedStructure: ecBuild,
      locationSecurity: 0.5,
      reactionStructure: refinery({ id: 'rf-b', modifiers: [...TATARA_HULL, ...REACTOR_RIG] }),
      reactionSecurity: 0.0,
      ...BUILD,
    });
    expect(f.structureTeFactorOf(200)).toBeCloseTo(0.585, 6);
  });

  it('a refinery build structure hosts reactions itself when no reaction refinery is set', () => {
    const f = structureFactorsFor({
      selectedStructure: refinery({ modifiers: TATARA_HULL }),
      locationSecurity: 0.0,
      ...BUILD,
    });
    expect(f.structureTeFactorOf(200)).toBeCloseTo(0.75, 6);
  });
});

describe('structureReadouts — per-slot pills', () => {
  const ecBuild = ec({ modifiers: EC_HULL });
  const reactionRefinery = refinery({ id: 'rf-b', modifiers: TATARA_HULL });
  const call = (
    selectedStructure: AvailableStructure | null,
    reactionStructure: AvailableStructure | null,
    locationSecurity: number | null = 0.0,
    reactionSecurity: number | null = 0.0,
  ) => {
    const factors = structureFactorsFor({
      selectedStructure,
      locationSecurity,
      reactionStructure,
      reactionSecurity,
      ...BUILD,
    });
    return structureReadouts({ selectedStructure, reactionStructure, factors });
  };

  it('build slot shows Mfg only; reaction slot shows Rxn only (no double pill)', () => {
    const { build, reaction } = call(ecBuild, reactionRefinery);
    expect(build.mfg?.me).toBeCloseTo(5, 6);
    expect(build.rxn).toBeNull();
    expect(reaction.rxn?.te).toBeCloseTo(25, 6);
    expect(reaction.mfg).toBeNull();
  });

  it('a refinery build structure with no reaction refinery shows BOTH pills on the build slot', () => {
    const { build, reaction } = call(refinery({ modifiers: [...TATARA_HULL, ...ME_RIG] }), null);
    expect(build.mfg).not.toBeNull();
    expect(build.rxn?.te).toBeCloseTo(25, 6);
    expect(reaction.mfg).toBeNull();
    expect(reaction.rxn).toBeNull();
  });

  it('a lone refinery in the reaction slot shows BOTH pills there', () => {
    const { build, reaction } = call(null, refinery({ modifiers: [...TATARA_HULL, ...ME_RIG] }), null, 0.0);
    expect(build.mfg).toBeNull();
    expect(reaction.mfg).not.toBeNull();
    expect(reaction.rxn?.te).toBeCloseTo(25, 6);
  });

  it('nothing selected → no pills', () => {
    const { build, reaction } = call(null, null);
    expect(build.mfg).toBeNull();
    expect(build.rxn).toBeNull();
    expect(reaction.mfg).toBeNull();
    expect(reaction.rxn).toBeNull();
  });
});

describe('composeFeeInputs', () => {
  const location = (mfg: number | null, rxn: number | null) => ({
    adjustedPrices: new Map([[34, 5]]),
    costIndices: { manufacturing: mfg, reaction: rxn },
  });
  const rxnLocation = { costIndex: 0.02, adjustedPrices: new Map([[16656, 7]]) };
  const compose = (over: Partial<Parameters<typeof composeFeeInputs>[0]>) =>
    composeFeeInputs({
      location: null,
      reactionLocation: null,
      buildStructure: null,
      reactionStructure: null,
      structureCostBonusPct: 0,
      ...over,
    });

  it('returns undefined with no fee source (the gross-only path)', () => {
    expect(compose({})).toBeUndefined();
    expect(compose({ reactionStructure: make({ groupId: SDE_REFINERY_GROUP_ID }) })).toBeUndefined();
  });

  it('composes the mfg keys from the build location + the build slot structure tax', () => {
    const fee = compose({
      location: location(0.04, 0.01),
      buildStructure: make({ taxPct: 1.5 }),
      structureCostBonusPct: 3,
    })!;
    expect(fee.systemCostIndex).toBe(0.04);
    expect(fee.facilityTaxPct).toBe(1.5);
    expect(fee.structureCostBonusPct).toBe(3);
    expect(fee.reaction).toBeUndefined();
    expect(fee.adjustedPriceOf(34)).toBe(5);
    expect(fee.adjustedPriceOf(99)).toBeNull();
  });

  it("never lends a lone reaction-slot refinery's tax to the manufacturing fee", () => {
    const fee = compose({
      location: location(0.04, 0.01),
      reactionStructure: make({ groupId: SDE_REFINERY_GROUP_ID, taxPct: 2 }),
    })!;
    expect(fee.facilityTaxPct).toBeNull();
    expect(fee.reaction).toBeUndefined();
  });

  it('routes the reaction-slot fetch + the reaction host tax into the reaction key', () => {
    const fee = compose({
      reactionLocation: rxnLocation,
      reactionStructure: make({ groupId: SDE_REFINERY_GROUP_ID, taxPct: 0.5 }),
    })!;
    expect(fee.reaction).toEqual({ systemCostIndex: 0.02, facilityTaxPct: 0.5 });
    expect(fee.systemCostIndex).toBeNull();
    expect(fee.adjustedPriceOf(16656)).toBe(7);
  });

  it("falls back to the build system's reaction index for a build-slot refinery", () => {
    const fee = compose({
      location: location(0.04, 0.03),
      buildStructure: make({ groupId: SDE_REFINERY_GROUP_ID, taxPct: 1 }),
    })!;
    expect(fee.reaction).toEqual({ systemCostIndex: 0.03, facilityTaxPct: 1 });
    expect(fee.facilityTaxPct).toBe(1);
  });
});

describe('structureFactorsFor — typed-in bonuses', () => {
  const ENTERED = {
    manufacturing: { me: 3.38, te: 39.2, cost: 4 },
    reactions: { me: 2.64, te: 44.8 },
  };

  it('applies typed-in values as-is: no hull, no rigs, no security, even without a system', () => {
    const f = structureFactorsFor({
      selectedStructure: refinery({ modifiers: [...TATARA_HULL, ...REACTOR_RIG], enteredBonuses: ENTERED }),
      locationSecurity: null,
      ...BUILD,
    });
    expect(f.active).toBe(true);
    expect(f.structureMeFactorOf(100)).toBeCloseTo(1 - 0.0338, 9);
    expect(f.structureTeFactorOf(100)).toBeCloseTo(1 - 0.392, 9);
    expect(f.structureCostBonusPct).toBe(4);
    expect(f.structureMeFactorOf(200)).toBeCloseTo(1 - 0.0264, 9);
    expect(f.structureTeFactorOf(200)).toBeCloseTo(1 - 0.448, 9);
  });

  it('gives the same numbers in high, low and null security', () => {
    const factorsAt = (locationSecurity: number) =>
      structureFactorsFor({
        selectedStructure: ec({ enteredBonuses: ENTERED }),
        locationSecurity,
        ...BUILD,
      });
    const meFactors = [0.9, 0.3, -0.5].map((sec) => factorsAt(sec).structureMeFactorOf(100));
    expect(new Set(meFactors).size).toBe(1);
  });
});

describe('structureBonusesAt', () => {
  it('uses typed-in values as-is and reads reactions only on a refinery', () => {
    const entered = { manufacturing: { me: 1, te: 15, cost: 3 }, reactions: { me: 2, te: 20 } };
    expect(structureBonusesAt(ec({ enteredBonuses: entered }), null)).toEqual({
      mfg: { me: 1, te: 15, costBonus: 3 },
      rxn: null,
    });
    expect(structureBonusesAt(refinery({ enteredBonuses: entered }), null).rxn).toEqual({
      me: 2,
      te: 20,
      costBonus: 0,
    });
  });

  it('scales a fitted rig by the system security and has nothing without a system', () => {
    const fitted = ec({ modifiers: [hull('material', 0.99), ...ME_RIG] });
    expect(structureBonusesAt(fitted, -0.4).mfg?.me).toBeCloseTo((1 - 0.99 * (1 - 0.042)) * 100, 6);
    expect(structureBonusesAt(fitted, null)).toEqual({ mfg: null, rxn: null });
  });

  it('uses attainable overlapping filters for list and no-job readouts, preserving per-job factors', () => {
    const azbel = ec({
      structureTypeId: 35826,
      modifiers: [
        hull('material', 0.99),
        hull('time', 0.8),
        rig('material', -2.4, 7),
        rig('time', -24, 7),
        rig('material', -2.4, 8),
        rig('time', -24, 8),
      ],
      targetFilterSets: [[3, 7], [3, 8], [3, 7, 8]],
    });
    const list = structureBonusesAt(azbel, 0).mfg;
    expect(list?.me).toBeCloseTo(10.72772416, 8);
    expect(list?.te).toBeCloseTo(80.31872, 8);
    const emptyBuild = structureFactorsFor({
      selectedStructure: azbel,
      locationSecurity: 0,
      nodeActivityByBlueprint: {},
      nodeFilterIds: {},
      topBlueprintTypeId: 89637,
    });
    expect(emptyBuild.manufacturingBonus).toEqual(list);
    const odysseus = structureFactorsFor({
      selectedStructure: azbel,
      locationSecurity: 0,
      nodeActivityByBlueprint: { 89637: MANUFACTURING_ACTIVITY },
      nodeFilterIds: { 89637: [3, 7, 8] },
      topBlueprintTypeId: 89637,
    });
    expect(odysseus.manufacturingBonus).toEqual(list);
    expect(odysseus.structureMeFactorOf(89637)).toBeCloseTo(0.8927227584, 10);
  });

  it('takes a corp structure security band from the synced row', () => {
    const corp = ec({ source: 'corp', securityClass: 'high', modifiers: [hull('material', 0.99), ...ME_RIG] });
    expect(structureBonusesAt(corp, null).mfg?.me).toBeCloseTo((1 - 0.99 * 0.98) * 100, 6);
  });
});
