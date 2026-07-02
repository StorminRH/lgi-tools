import { describe, expect, it } from 'vitest';
import {
  SDE_CITADEL_GROUP_ID,
  SDE_ENGINEERING_COMPLEX_GROUP_ID,
  SDE_REFINERY_GROUP_ID,
} from '@/data/eve-data/constants';
import type { AvailableStructure } from './types';
import { MANUFACTURING_ACTIVITY, REACTION_ACTIVITY } from './structure-bonus';
import { hostsReactions, structureFactorsFor, structureReadouts } from './structure-factors';

// Synthetic structures with hand-built dogma (the precise bonus math is pinned in
// structure-bonus.test.ts; here we test the activity/security MAPPING of the one
// selected structure onto the per-node factors).
const make = (over: Partial<AvailableStructure>): AvailableStructure => ({
  id: 's',
  source: 'custom',
  name: 'Structure',
  structureTypeId: 0,
  groupId: SDE_ENGINEERING_COMPLEX_GROUP_ID,
  systemId: null,
  structureAttrs: {},
  rigAttrs: [],
  securityClass: null,
  taxPct: null,
  ...over,
});
// An Engineering Complex carries manufacturing role attrs (2600 mat / 2602 time /
// 2601 cost); a Refinery carries the reaction-time role attr (2721); a Citadel
// carries NO role attrs — its only bonus comes from whatever rigs are fitted. Each
// carries its real SDE group so coverage (who can HOST reactions) is exercised too.
const ec = (over: Partial<AvailableStructure>) =>
  make({ id: 'ec', name: 'Azbel', groupId: SDE_ENGINEERING_COMPLEX_GROUP_ID, ...over });
const refinery = (over: Partial<AvailableStructure>) =>
  make({ id: 'rf', name: 'Tatara', groupId: SDE_REFINERY_GROUP_ID, ...over });
const citadel = (over: Partial<AvailableStructure>) =>
  make({ id: 'ct', name: 'Fortizar', groupId: SDE_CITADEL_GROUP_ID, ...over });

// blueprint 100 = a manufacturing job; blueprint 200 = a reaction job.
const NODE_ACTIVITY = { 100: MANUFACTURING_ACTIVITY, 200: REACTION_ACTIVITY };

// A manufacturing-efficiency rig: −2% material, −20% time, with the three per-class
// sec multipliers (hi 1.0 / low 1.9 / null 2.1).
const ME_RIG = { 2594: -2, 2593: -20, 2595: 0, 2355: 1.0, 2356: 1.9, 2357: 2.1 };
// A reactor-efficiency rig: −20% time, NO high-sec multiplier (banned in hi-sec).
const REACTOR_RIG = { 2713: -20, 2356: 1.0, 2357: 1.1 };

describe('structureFactorsFor — activity mapping of the one selected structure', () => {
  it('applies an EC bonus to manufacturing nodes only; reaction nodes are untouched', () => {
    const f = structureFactorsFor({
      selectedStructure: ec({ structureAttrs: { 2600: 0.95, 2602: 0.9, 2601: 0.96 } }),
      locationSecurity: 0.0, // null-sec
      nodeActivityByBlueprint: NODE_ACTIVITY,
    });
    expect(f.active).toBe(true);
    expect(f.structureMeFactorOf(100)).toBeCloseTo(0.95, 6); // mfg node reduced 5%
    expect(f.structureMeFactorOf(200)).toBe(1); // reaction node: no structure ME
    expect(f.structureTeFactorOf(100)).toBeCloseTo(0.9, 6); // mfg time −10%
    expect(f.structureTeFactorOf(200)).toBe(1);
    expect(f.structureCostBonusPct).toBeCloseTo(4, 6); // top-job cost −4%
  });

  it('applies a Refinery time bonus to reaction nodes; reactions never get structure ME', () => {
    const f = structureFactorsFor({
      selectedStructure: refinery({ structureAttrs: { 2721: 0.75 } }),
      locationSecurity: 0.0,
      nodeActivityByBlueprint: NODE_ACTIVITY,
    });
    expect(f.structureTeFactorOf(200)).toBeCloseTo(0.75, 6); // reaction time −25%
    expect(f.structureMeFactorOf(200)).toBe(1); // me=0 divergence holds
    expect(f.structureTeFactorOf(100)).toBe(1); // no manufacturing bonus
    expect(f.structureCostBonusPct).toBe(0); // reactions carry no job-cost bonus
  });

  it('a Citadel + a manufacturing rig bonuses manufacturing nodes (rig only, no role)', () => {
    // A Citadel has NO role attrs, but a mfg rig fits it — so a manufacturing node
    // still drops, from the rig alone; reaction nodes are untouched.
    const f = structureFactorsFor({
      selectedStructure: citadel({ structureAttrs: {}, rigAttrs: [ME_RIG] }),
      locationSecurity: 0.5, // hi-sec → rig multiplier 1.0
      nodeActivityByBlueprint: NODE_ACTIVITY,
    });
    expect(f.active).toBe(true);
    // structure 1 (no role) × rig (1 + (−2/100)·1.0 = 0.98) = 0.98
    expect(f.structureMeFactorOf(100)).toBeCloseTo(0.98, 6);
    expect(f.structureTeFactorOf(100)).toBeCloseTo(0.8, 6); // rig time −20%
    expect(f.structureCostBonusPct).toBe(0); // the rig carries no cost reduction
    expect(f.structureMeFactorOf(200)).toBe(1); // reaction node untouched
    expect(f.structureTeFactorOf(200)).toBe(1);
    expect(f.reactionBonus?.te ?? 0).toBe(0); // no reaction pill
  });

  it('one Tatara fitted with both a mfg rig and a reaction rig bonuses BOTH node types', () => {
    // The single pick contributes a manufacturing bonus (via the mfg rig) AND a
    // reaction bonus (via 2721 + the reactor rig) — the wrong-activity rig no-ops
    // in each branch.
    const f = structureFactorsFor({
      selectedStructure: refinery({ structureAttrs: { 2721: 0.75 }, rigAttrs: [ME_RIG, REACTOR_RIG] }),
      locationSecurity: 0.0, // null-sec
      nodeActivityByBlueprint: NODE_ACTIVITY,
    });
    expect(f.active).toBe(true);
    // manufacturing node: ME rig only (1 + (−2/100)·2.1 = 0.958); reactor rig no-ops
    expect(f.structureMeFactorOf(100)).toBeCloseTo(0.958, 6);
    // manufacturing time: ME rig (1 + (−20/100)·2.1 = 0.58)
    expect(f.structureTeFactorOf(100)).toBeCloseTo(0.58, 6);
    // reaction node: structure 0.75 × reactor rig (1 + (−20/100)·1.1 = 0.78) = 0.585
    expect(f.structureTeFactorOf(200)).toBeCloseTo(0.585, 6);
    expect(f.structureMeFactorOf(200)).toBe(1); // reactions keep me=0
    expect(f.manufacturingBonus).not.toBeNull();
    expect(f.reactionBonus).not.toBeNull();
  });

  it('no structure selected → NO_STRUCTURE_FACTORS (the byte-identical anchor)', () => {
    const f = structureFactorsFor({
      selectedStructure: null,
      locationSecurity: 0.0,
      nodeActivityByBlueprint: NODE_ACTIVITY,
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
      selectedStructure: ec({ structureAttrs: { 2600: 0.95 } }),
      locationSecurity: null, // no build location → no security → inactive
      nodeActivityByBlueprint: NODE_ACTIVITY,
    });
    expect(f.active).toBe(false);
    expect(f.manufacturingBonus).toBeNull();
    expect(f.reactionBonus).toBeNull();
    expect(f.structureMeFactorOf(100)).toBe(1);
    expect(f.structureCostBonusPct).toBe(0);
  });

  it('a corp structure carries its own security, so it is active with no build location', () => {
    const f = structureFactorsFor({
      selectedStructure: ec({ source: 'corp', securityClass: 'null', structureAttrs: { 2600: 0.95 } }),
      locationSecurity: null,
      nodeActivityByBlueprint: NODE_ACTIVITY,
    });
    expect(f.active).toBe(true);
    expect(f.structureMeFactorOf(100)).toBeCloseTo(0.95, 6);
  });
});

describe('structureFactorsFor — security from the build system scales rigs', () => {
  const withMeRig = ec({ structureAttrs: { 2600: 0.99 }, rigAttrs: [ME_RIG] });

  it('null-sec applies the strongest rig multiplier (2.1)', () => {
    const f = structureFactorsFor({
      selectedStructure: withMeRig,
      locationSecurity: 0.0, // null-sec
      nodeActivityByBlueprint: NODE_ACTIVITY,
    });
    // structure 0.99 × rig (1 + (−2/100)·2.1 = 0.958) = 0.94842
    expect(f.structureMeFactorOf(100)).toBeCloseTo(0.94842, 6);
  });

  it('high-sec applies the weakest rig multiplier (1.0) — same structure, different system', () => {
    const f = structureFactorsFor({
      selectedStructure: withMeRig,
      locationSecurity: 0.5, // hi-sec
      nodeActivityByBlueprint: NODE_ACTIVITY,
    });
    // structure 0.99 × rig (1 + (−2/100)·1.0 = 0.98) = 0.9702
    expect(f.structureMeFactorOf(100)).toBeCloseTo(0.9702, 6);
  });

  it('bans a reaction rig in high-sec (no 2355 multiplier) — only the role bonus applies', () => {
    const sel = refinery({ structureAttrs: { 2721: 0.75 }, rigAttrs: [REACTOR_RIG] });
    const hi = structureFactorsFor({ selectedStructure: sel, locationSecurity: 0.5, nodeActivityByBlueprint: NODE_ACTIVITY });
    const nul = structureFactorsFor({ selectedStructure: sel, locationSecurity: 0.0, nodeActivityByBlueprint: NODE_ACTIVITY });
    // hi-sec: rig contributes nothing → only the 0.75 role bonus → te factor 0.75
    expect(hi.structureTeFactorOf(200)).toBeCloseTo(0.75, 6);
    // null-sec: rig active (1 + (−20/100)·1.1 = 0.78) × 0.75 = 0.585
    expect(nul.structureTeFactorOf(200)).toBeCloseTo(0.585, 6);
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
  const ecBuild = ec({ structureAttrs: { 2600: 0.95, 2602: 0.9, 2601: 0.96 } });
  const reactionRefinery = refinery({ id: 'rf-b', structureAttrs: { 2721: 0.75 } });

  it('is byte-identical to the single-structure path when no reaction refinery is given', () => {
    // Omitting reactionStructure ⇒ reactions fall back to the build structure, so the
    // output matches the pre-3.7.12.2 single-structure call for every group.
    for (const build of [ecBuild, refinery({ structureAttrs: { 2721: 0.75 } }), citadel({ rigAttrs: [ME_RIG] })]) {
      const base = { selectedStructure: build, locationSecurity: 0.0, nodeActivityByBlueprint: NODE_ACTIVITY };
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
      nodeActivityByBlueprint: NODE_ACTIVITY,
    });
    expect(f.structureMeFactorOf(100)).toBeCloseTo(0.95, 6); // mfg node: EC's ME −5%
    expect(f.structureTeFactorOf(100)).toBeCloseTo(0.9, 6); // mfg time −10%
    expect(f.structureTeFactorOf(200)).toBeCloseTo(0.75, 6); // reactions off the refinery −25%
    expect(f.structureMeFactorOf(200)).toBe(1); // reactions never get ME
    expect(f.structureCostBonusPct).toBeCloseTo(4, 6); // top mfg job cost is the EC's
  });

  it('a lone refinery does the WHOLE chain (reactions AND manufacturing), in either slot', () => {
    const lone = refinery({ structureAttrs: { 2721: 0.75 }, rigAttrs: [ME_RIG] });
    // in the build slot:
    const asBuild = structureFactorsFor({
      selectedStructure: lone,
      locationSecurity: 0.0,
      nodeActivityByBlueprint: NODE_ACTIVITY,
    });
    expect(asBuild.structureMeFactorOf(100)).toBeCloseTo(0.958, 6); // mfg rig at null-sec
    expect(asBuild.structureTeFactorOf(200)).toBeCloseTo(0.75, 6); // reaction role
    // in the reaction slot with an EMPTY build slot → still does both:
    const asReaction = structureFactorsFor({
      selectedStructure: null,
      locationSecurity: null,
      reactionStructure: lone,
      reactionSecurity: 0.0,
      nodeActivityByBlueprint: NODE_ACTIVITY,
    });
    expect(asReaction.structureMeFactorOf(100)).toBeCloseTo(0.958, 6); // lone refinery manufactures too
    expect(asReaction.structureTeFactorOf(200)).toBeCloseTo(0.75, 6);
  });

  it("scales the refinery's reaction rig against the refinery's OWN system security", () => {
    // Build structure in hi-sec, refinery (with a reactor rig) in null-sec: the rig must
    // scale against the refinery's null-sec (active, 1.1) not the build's hi-sec (banned).
    const f = structureFactorsFor({
      selectedStructure: ecBuild,
      locationSecurity: 0.5, // build: hi-sec
      reactionStructure: refinery({ id: 'rf-b', structureAttrs: { 2721: 0.75 }, rigAttrs: [REACTOR_RIG] }),
      reactionSecurity: 0.0, // refinery: null-sec
      nodeActivityByBlueprint: NODE_ACTIVITY,
    });
    // 0.75 × reactor rig (1 + (−20/100)·1.1 = 0.78) = 0.585 — proves the refinery's sec won
    expect(f.structureTeFactorOf(200)).toBeCloseTo(0.585, 6);
  });

  it('a refinery build structure hosts reactions itself when no reaction refinery is set', () => {
    const f = structureFactorsFor({
      selectedStructure: refinery({ structureAttrs: { 2721: 0.75 } }),
      locationSecurity: 0.0,
      nodeActivityByBlueprint: NODE_ACTIVITY,
    });
    expect(f.structureTeFactorOf(200)).toBeCloseTo(0.75, 6);
  });
});

describe('structureReadouts — per-slot pills', () => {
  const ecBuild = ec({ structureAttrs: { 2600: 0.95, 2602: 0.9, 2601: 0.96 } });
  const reactionRefinery = refinery({ id: 'rf-b', structureAttrs: { 2721: 0.75 } });
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
      nodeActivityByBlueprint: NODE_ACTIVITY,
    });
    return structureReadouts({ selectedStructure, reactionStructure, factors });
  };

  it('build slot shows Mfg only; reaction slot shows Rxn only (no double pill)', () => {
    const { build, reaction } = call(ecBuild, reactionRefinery);
    expect(build.mfg?.me).toBeCloseTo(5, 6); // EC manufacturing
    expect(build.rxn).toBeNull(); // the refinery took over reactions
    expect(reaction.rxn?.te).toBeCloseTo(25, 6); // refinery reaction
    expect(reaction.mfg).toBeNull();
  });

  it('a refinery build structure with no reaction refinery shows BOTH pills on the build slot', () => {
    const { build, reaction } = call(refinery({ structureAttrs: { 2721: 0.75 }, rigAttrs: [ME_RIG] }), null);
    expect(build.mfg).not.toBeNull();
    expect(build.rxn?.te).toBeCloseTo(25, 6); // it hosts reactions too
    expect(reaction.mfg).toBeNull();
    expect(reaction.rxn).toBeNull();
  });

  it('a lone refinery in the reaction slot shows BOTH pills there', () => {
    const { build, reaction } = call(null, refinery({ structureAttrs: { 2721: 0.75 }, rigAttrs: [ME_RIG] }), null, 0.0);
    expect(build.mfg).toBeNull();
    expect(reaction.mfg).not.toBeNull(); // lone refinery manufactures
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
