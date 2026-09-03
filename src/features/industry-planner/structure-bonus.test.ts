import { describe, expect, it } from 'vitest';
import type { AttrMap } from '@/data/eve-data/types';
import {
  computeStructureBonus,
  MANUFACTURING_ACTIVITY,
  REACTION_ACTIVITY,
  type SecurityClass,
} from './structure-bonus';

const RAITARU: AttrMap = { 2600: 0.99, 2602: 0.85, 2601: 0.97 };
const AZBEL: AttrMap = { 2600: 0.99, 2602: 0.8, 2601: 0.96 };
const SOTIYO: AttrMap = { 2600: 0.99, 2602: 0.7, 2601: 0.95 };
const TATARA: AttrMap = { 2721: 0.75 };
const ATHANOR: AttrMap = {};

const SEC = { 2355: 1.0, 2356: 1.9, 2357: 2.1 };
const ME_RIG_T1: AttrMap = { 2594: -2, ...SEC };
const ME_RIG_T2: AttrMap = { 2594: -2.4, ...SEC };
const COMBINED_RIG: AttrMap = { 2593: -20, 2594: -2, ...SEC };
const REACTOR_RIG: AttrMap = { 2713: -20, 2714: -2, 2356: 1.0, 2357: 1.1 };

const mfg = (structureAttrs: AttrMap, rigAttrs: AttrMap[], securityClass: SecurityClass) =>
  computeStructureBonus({ structureAttrs, rigAttrs, securityClass, activityId: MANUFACTURING_ACTIVITY });
const reaction = (structureAttrs: AttrMap, rigAttrs: AttrMap[], securityClass: SecurityClass) =>
  computeStructureBonus({ structureAttrs, rigAttrs, securityClass, activityId: REACTION_ACTIVITY });

describe('computeStructureBonus — structure role only', () => {
  it('reads the flat 1% material and tiered time/cost from each EC', () => {
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
    const { me, te, costBonus } = mfg(AZBEL, [ME_RIG_T1], 'null');
    expect(me).toBeCloseTo(5.158, 6);
    expect(te).toBeCloseTo(20, 6);
    expect(costBonus).toBeCloseTo(4, 6);
  });

  it('matches the canonical Sotiyo + T2 ME rig (null) reduction', () => {
    expect(mfg(SOTIYO, [ME_RIG_T2], 'null').me).toBeCloseTo(5.9896, 6);
  });

  it('applies one combined rig to both material and time at once', () => {
    const { me, te, costBonus } = mfg(AZBEL, [COMBINED_RIG], 'null');
    expect(me).toBeCloseTo(5.158, 6);
    expect(te).toBeCloseTo(53.6, 6);
    expect(costBonus).toBeCloseTo(4, 6);
  });

  it('multiplies multiple material rigs as independent factors', () => {
    expect(mfg(AZBEL, [ME_RIG_T1, COMBINED_RIG], 'null').me).toBeCloseTo(9.141364, 5);
  });
});

describe('computeStructureBonus — security scaling (rig only)', () => {
  it('scales the rig bonus by sec class while the structure role stays fixed', () => {
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
    expect(reaction(TATARA, [REACTOR_RIG], 'null').me).toBe(0);
  });

  it('applies the Tatara reaction-time role bonus stacked with the reactor rig', () => {
    const { me, te, costBonus } = reaction(TATARA, [REACTOR_RIG], 'null');
    expect(me).toBe(0);
    expect(te).toBeCloseTo(41.5, 6);
    expect(costBonus).toBe(0);
  });

  it('gives the Athanor no reaction-time role bonus (rig-only)', () => {
    expect(reaction(ATHANOR, [], 'null')).toEqual({ me: 0, te: 0, costBonus: 0 });
    expect(reaction(ATHANOR, [REACTOR_RIG], 'null').te).toBeCloseTo(22, 6);
  });

  it('makes a reaction rig a no-op in high-sec (no high-sec multiplier exists)', () => {
    expect(reaction(TATARA, [REACTOR_RIG], 'high').te).toBeCloseTo(25, 6);
  });
});

describe('computeStructureBonus — composes with blueprint ME (contract pin)', () => {
  const requiredQty = (baseQty: number, runs: number, bpMe: number, structureMe: number): number => {
    const modifier = (1 - bpMe / 100) * (1 - structureMe / 100);
    return Math.max(runs, Math.ceil(Math.round(runs * baseQty * modifier * 100) / 100));
  };

  it('stacks the structure ME on blueprint ME through the round-then-ceil', () => {
    const { me } = mfg(SOTIYO, [ME_RIG_T2], 'null');
    expect(requiredQty(100, 1, 10, me)).toBe(85);
    expect(requiredQty(100, 1, 10, 0)).toBe(90);
  });

  it('honours the ≥1-per-run floor under a heavy structure reduction', () => {
    const { me } = mfg(SOTIYO, [ME_RIG_T2, COMBINED_RIG], 'null');
    expect(requiredQty(1, 3, 10, me)).toBe(3);
  });
});
