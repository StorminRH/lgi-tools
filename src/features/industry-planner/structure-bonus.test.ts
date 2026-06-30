import { describe, expect, it } from 'vitest';
import type { AttrMap } from '@/data/eve-data/types';
import {
  computeStructureBonus,
  MANUFACTURING_ACTIVITY,
  REACTION_ACTIVITY,
  type SecurityClass,
} from './structure-bonus';

// Fixtures use the VERIFIED SDE dogma values (everef/skoli, 2026-06):
//   ECs: 2600 material 0.99 (all) · 2602 time 0.85/0.80/0.70 · 2601 cost 0.97/0.96/0.95
//   Refineries: 2721 reaction-time 0.75 (Tatara only; absent on Athanor)
//   Mfg rigs: base 2593 time / 2594 material / 2595 cost; sec 2355=1.0/2356=1.9/2357=2.1
//   Reaction rigs: base 2713 time / 2714 material; sec 2356=1.0/2357=1.1; NO 2355 (HS-banned)
const RAITARU: AttrMap = { 2600: 0.99, 2602: 0.85, 2601: 0.97 };
const AZBEL: AttrMap = { 2600: 0.99, 2602: 0.8, 2601: 0.96 };
const SOTIYO: AttrMap = { 2600: 0.99, 2602: 0.7, 2601: 0.95 };
const TATARA: AttrMap = { 2721: 0.75 };
const ATHANOR: AttrMap = {}; // no reaction-time role bonus

const SEC = { 2355: 1.0, 2356: 1.9, 2357: 2.1 };
// Standup M-Set Structure Manufacturing Material Efficiency I (43875): ME −2%
const ME_RIG_T1: AttrMap = { 2594: -2, ...SEC };
// …Equipment Manufacturing Material Efficiency II (43921): ME −2.4%
const ME_RIG_T2: AttrMap = { 2594: -2.4, ...SEC };
// Standup L-Set Structure Manufacturing Efficiency I (43720): combined TE −20% + ME −2%
const COMBINED_RIG: AttrMap = { 2593: -20, 2594: -2, ...SEC };
// Standup L-Set Reactor Efficiency I (46496): time −20%, material −2%; sec 1.0/1.1; no 2355
const REACTOR_RIG: AttrMap = { 2713: -20, 2714: -2, 2356: 1.0, 2357: 1.1 };

const mfg = (structureAttrs: AttrMap, rigAttrs: AttrMap[], securityClass: SecurityClass) =>
  computeStructureBonus({ structureAttrs, rigAttrs, securityClass, activityId: MANUFACTURING_ACTIVITY });
const reaction = (structureAttrs: AttrMap, rigAttrs: AttrMap[], securityClass: SecurityClass) =>
  computeStructureBonus({ structureAttrs, rigAttrs, securityClass, activityId: REACTION_ACTIVITY });

describe('computeStructureBonus — structure role only', () => {
  it('reads the flat 1% material and tiered time/cost from each EC', () => {
    // ME 0.99→1%, TE 0.85/0.80/0.70→15/20/30%, cost 0.97/0.96/0.95→3/4/5%.
    const raitaru = mfg(RAITARU, [], 'null');
    expect(raitaru.me).toBeCloseTo(1, 6);
    expect(raitaru.te).toBeCloseTo(15, 6);
    expect(raitaru.costBonus).toBeCloseTo(3, 6);

    const sotiyo = mfg(SOTIYO, [], 'high');
    expect(sotiyo.me).toBeCloseTo(1, 6);
    expect(sotiyo.te).toBeCloseTo(30, 6);
    expect(sotiyo.costBonus).toBeCloseTo(5, 6);
  });

  it('returns no bonus for a structure with no role attributes (NPC-station-like)', () => {
    expect(mfg({}, [], 'null')).toEqual({ me: 0, te: 0, costBonus: 0 });
  });
});

describe('computeStructureBonus — structure role × rig composition', () => {
  it('stacks an ME rig on the structure material bonus multiplicatively', () => {
    // 0.99 · (1 − 0.02·2.1) = 0.99 · 0.958 = 0.94842 → 5.158% (NOT the additive 1+4.2=5.2).
    const { me, te, costBonus } = mfg(AZBEL, [ME_RIG_T1], 'null');
    expect(me).toBeCloseTo(5.158, 6);
    expect(te).toBeCloseTo(20, 6); // an ME rig leaves time/cost at the structure role value
    expect(costBonus).toBeCloseTo(4, 6);
  });

  it('matches the canonical Sotiyo + T2 ME rig (null) reduction', () => {
    // 0.99 · (1 − 0.024·2.1) = 0.99 · 0.9496 = 0.940104 → 5.9896%.
    expect(mfg(SOTIYO, [ME_RIG_T2], 'null').me).toBeCloseTo(5.9896, 6);
  });

  it('applies one combined rig to both material and time at once', () => {
    // me: 0.99·0.958 = 0.94842 → 5.158% ; te: 0.80·(1−0.20·2.1)=0.80·0.58=0.464 → 53.6%.
    const { me, te, costBonus } = mfg(AZBEL, [COMBINED_RIG], 'null');
    expect(me).toBeCloseTo(5.158, 6);
    expect(te).toBeCloseTo(53.6, 6);
    expect(costBonus).toBeCloseTo(4, 6);
  });

  it('multiplies multiple material rigs as independent factors', () => {
    // Two −2% ME rigs in null: 0.99·0.958·0.958 = 0.90858636 → 9.141364%.
    expect(mfg(AZBEL, [ME_RIG_T1, COMBINED_RIG], 'null').me).toBeCloseTo(9.141364, 5);
  });
});

describe('computeStructureBonus — security scaling (rig only)', () => {
  it('scales the rig bonus by sec class while the structure role stays fixed', () => {
    // Azbel + T1 ME rig: hi ×1.0 → 2.98%, low ×1.9 → 4.762%, null ×2.1 → 5.158%.
    expect(mfg(AZBEL, [ME_RIG_T1], 'high').me).toBeCloseTo(2.98, 6);
    expect(mfg(AZBEL, [ME_RIG_T1], 'low').me).toBeCloseTo(4.762, 6);
    expect(mfg(AZBEL, [ME_RIG_T1], 'null').me).toBeCloseTo(5.158, 6);
  });

  it('treats wormhole space with the null-sec multiplier', () => {
    expect(mfg(AZBEL, [ME_RIG_T1], 'wormhole').me).toBeCloseTo(mfg(AZBEL, [ME_RIG_T1], 'null').me, 9);
  });
});

describe('computeStructureBonus — reactions', () => {
  it('grants NO material efficiency even when the reaction rig carries a material attr', () => {
    // Standing rule: reactions get no structure ME. The reactor rig's 2714 (−2%) is
    // deliberately ignored — me must be exactly 0.
    expect(reaction(TATARA, [REACTOR_RIG], 'null').me).toBe(0);
  });

  it('applies the Tatara reaction-time role bonus stacked with the reactor rig', () => {
    // te: 0.75·(1 − 0.20·1.1) = 0.75·0.78 = 0.585 → 41.5% ; me & cost 0.
    const { me, te, costBonus } = reaction(TATARA, [REACTOR_RIG], 'null');
    expect(me).toBe(0);
    expect(te).toBeCloseTo(41.5, 6);
    expect(costBonus).toBe(0);
  });

  it('gives the Athanor no reaction-time role bonus (rig-only)', () => {
    // Athanor has no 2721 → structure multiplier defaults to 1.0.
    expect(reaction(ATHANOR, [], 'null')).toEqual({ me: 0, te: 0, costBonus: 0 });
    // With a reactor rig in null the time bonus comes entirely from the rig: 1−0.78 = 22%.
    expect(reaction(ATHANOR, [REACTOR_RIG], 'null').te).toBeCloseTo(22, 6);
  });

  it('makes a reaction rig a no-op in high-sec (no high-sec multiplier exists)', () => {
    // Reaction rigs carry no 2355 (banned in HS) → the rig contributes nothing,
    // leaving only the structure role time bonus (Tatara 25%).
    expect(reaction(TATARA, [REACTOR_RIG], 'high').te).toBeCloseTo(25, 6);
  });
});

describe('computeStructureBonus — composes with blueprint ME (contract pin)', () => {
  // The output is an effective reduction PERCENT, designed to slot into EVE's
  // material formula as one more `(1 − pct/100)` factor alongside the blueprint
  // ME. This mirrors build-batch.ts's (module-private) `meAdjust` — wiring it into
  // the live tree is the UX session; here we pin that the form composes EVE-exactly:
  //   required = max(runs, ceil(round(runs · baseQty · (1 − bpME/100) · (1 − me/100), 2)))
  const requiredQty = (baseQty: number, runs: number, bpMe: number, structureMe: number): number => {
    const modifier = (1 - bpMe / 100) * (1 - structureMe / 100);
    return Math.max(runs, Math.ceil(Math.round(runs * baseQty * modifier * 100) / 100));
  };

  it('stacks the structure ME on blueprint ME through the round-then-ceil', () => {
    // Sotiyo + T2 ME rig in null → me = 5.9896%; blueprint ME 10; 100 units, 1 run.
    // 100 · 0.90 · 0.940104 = 84.60936 → round2 84.61 → ceil 85 (vs 90 at the BP ME alone).
    const { me } = mfg(SOTIYO, [ME_RIG_T2], 'null');
    expect(requiredQty(100, 1, 10, me)).toBe(85);
    expect(requiredQty(100, 1, 10, 0)).toBe(90); // structure factor is the only difference
  });

  it('honours the ≥1-per-run floor under a heavy structure reduction', () => {
    // 1 unit/run can never be reduced below the run count.
    const { me } = mfg(SOTIYO, [ME_RIG_T2, COMBINED_RIG], 'null');
    expect(requiredQty(1, 3, 10, me)).toBe(3);
  });
});
