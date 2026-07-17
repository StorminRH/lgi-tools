// Pure structure-efficiency bonus math for the Industry Planner (3.7.9.1).
//
// Given an Upwell structure's dogma, its fitted rigs' dogma, the system's
// security class, and the industry activity, returns the EFFECTIVE material /
// time / job-cost reductions that structure grants — the bonus that composes on
// top of the per-component blueprint ME/TE (3.7.5) when a build is placed there.
//
// PURE over the SDE dogma: the caller looks the dogma maps up once (via
// `getTypeAttributesBatch`) and passes them in, the same callback-seam discipline
// as `meOf`/`teOf` — so this stays inside the feature slice with no DB/ESI/auth
// import and is exhaustively unit-testable from hand-built AttrMaps.
//
// --- Verified game mechanics (each constant source-cited; HIGH confidence) ---
// Sources: EVE-Uni wiki, everef.net + skoli.ru (two SDE renderers), CCP dev
// blogs, Qoi's IndustryFormulas.pdf, philihp/eve-industry (modern impl), and our
// own production `meAdjust` (build-batch.ts) — all agree on the formula below.
//
// EVE's per-material quantity is
//   required = max(runs, ceil(round(runs · baseQty · materialModifier, 2)))
//   materialModifier = (1 − bpME/100) · structureMult · Π_rigs(1 + rigBase/100 · secMult)
// i.e. the blueprint ME, the structure role bonus, and EACH rig are independent
// multiplicative (1−x) factors, the security multiplier scales the RIG only, and
// the whole product is rounded ONCE (round-to-2 then ceil), floored at one per
// run. Time and job-cost compose the same way at their own engine points
// (`teFactor`; the `EIV × systemCostIndex` portion of the job fee).
//
// This module returns the structure's contribution as an effective REDUCTION
// PERCENT per dimension (so it slots into the engine as one more `× (1 − pct/100)`
// factor) at FULL precision — never pre-rounded, so the engine's single
// round-at-the-end stays EVE-exact.
//
// Encodings differ by source and are normalised here:
//   • Structure role bonus  → a MULTIPLIER on the structure type (e.g. 2600 = 0.99
//     means a 1% material reduction). Absent ⇒ 1.0 (no bonus). NOT security-scaled.
//   • Rig bonus             → a SIGNED PERCENT on the rig type (e.g. 2594 = −2 means
//     a 2% reduction). Absent ⇒ 0 (no-op). Scaled by the rig's OWN per-class
//     security multiplier (2355/2356/2357), read from the rig's dogma.

import type { SecurityClass } from '@/data/eve-data/security';
import type { AttrMap } from '@/data/eve-data/types';

// Re-exported from its shared home so this feature's consumers keep importing it
// here. The type moved to `src/data/eve-data/security.ts` (3.7.9) so the
// owned-structures store can share it without a feature→feature import.
export type { SecurityClass };

// SDE dogma attribute ids — real CCP ids from dgmAttributeTypes, verified against
// everef/skoli for the structures and Standup rigs this feature reads.
const ATTR = {
  // Structure role bonuses (MULTIPLIER form on the structure type).
  engMaterialBonus: 2600, // strEngMatBonus  — EC mfg material (0.99 on all ECs → flat 1%)
  engCostBonus: 2601, // strEngCostBonus     — EC mfg+science job fee (0.97/0.96/0.95)
  engTimeBonus: 2602, // strEngTimeBonus      — EC mfg+science time (0.85/0.80/0.70)
  reactionTimeBonus: 2721, // strReactionTimeMultiplier — Tatara reaction time (0.75); ABSENT on Athanor

  // Rig base bonuses (SIGNED PERCENT on the rig type; reductions negative).
  rigMfgTime: 2593,
  rigMfgMaterial: 2594,
  rigMfgCost: 2595,
  rigReactionTime: 2713,
  // 2714 (reaction-rig MATERIAL reduction) EXISTS in the SDE but is deliberately
  // unread — reactions get no structure ME (standing rule). See the reaction branch.

  // Per-rig security multipliers (each rig stores its own scaling per sec class).
  // Manufacturing/research rigs: 1.0 / 1.9 / 2.1. Reaction rigs: (none) / 1.0 / 1.1.
  secMultHigh: 2355,
  secMultLow: 2356,
  secMultNull: 2357, // covers BOTH null-sec and wormhole space
} as const;

/**
 * The two industry activities a structure modifies. CCP activity ids (constants.ts):
 * 1 = manufacturing, 11 = reaction.
 */
export const MANUFACTURING_ACTIVITY = 1;
/**
 * Canonical EVE industry activity identifier for reaction.
 */
export const REACTION_ACTIVITY = 11;
/**
 * Canonical identifier used by industry planner; consumers must not infer additional identity
 * semantics from its storage representation.
 */
export type IndustryActivityId = typeof MANUFACTURING_ACTIVITY | typeof REACTION_ACTIVITY;

/**
 * Effective structure reductions, each a PERCENT (e.g. 5.99 = a 5.99% reduction),
 * full precision. `me` is 0 for reactions. Compose downstream as `× (1 − x/100)`.
 */
export interface StructureBonus {
  me: number;
  te: number;
  costBonus: number;
}

/**
 * Structure dogma attributes, fitted rigs, security class, and activity needed to derive material
 * and time bonuses.
 */
export interface StructureBonusInput {
  // The structure type's dogma map ({ attributeId: value }).
  structureAttrs: AttrMap;
  // Each fitted rig's dogma map. Empty ⇒ structure role bonus only.
  rigAttrs: AttrMap[];
  securityClass: SecurityClass;
  activityId: IndustryActivityId;
}

function val(attrs: AttrMap, id: number, fallback = 0): number {
  const v = attrs[id];
  return v === undefined ? fallback : v;
}

function secMultAttrId(sec: SecurityClass): number {
  if (sec === 'high') return ATTR.secMultHigh;
  if (sec === 'low') return ATTR.secMultLow;
  return ATTR.secMultNull; // null + wormhole
}

// One rig's multiplicative factor for a dimension: 1 + base% · securityMultiplier.
// A rig missing the base attr (0) or its security multiplier (e.g. a reaction rig
// in high-sec, where it has no 2355 because reactions can't run there) contributes
// nothing (×1).
function rigFactor(rig: AttrMap, baseAttrId: number, sec: SecurityClass): number {
  const base = val(rig, baseAttrId);
  if (base === 0) return 1;
  const secMult = val(rig, secMultAttrId(sec));
  return 1 + (base / 100) * secMult;
}

// Effective reduction percent for one dimension: the structure's multiplier times
// every rig's factor, expressed as (1 − product) × 100. Full precision.
function reductionPct(
  structureMult: number,
  rigs: AttrMap[],
  rigBaseAttrId: number,
  sec: SecurityClass,
): number {
  let modifier = structureMult;
  for (const rig of rigs) modifier *= rigFactor(rig, rigBaseAttrId, sec);
  return (1 - modifier) * 100;
}

/**
 * The structure's effective material / time / cost reductions for an industry job
 * of `activityId` run in it. Pure: a function of the passed dogma + security class.
 */
export function computeStructureBonus(input: StructureBonusInput): StructureBonus {
  const { structureAttrs, rigAttrs, securityClass, activityId } = input;

  if (activityId === REACTION_ACTIVITY) {
    // Reactions get NO material efficiency from a structure (standing rule; the
    // reaction formula carries no ME and we do not apply one here).
    //
    // VERIFIED DIVERGENCE: reaction rigs DO carry a material-reduction attr (2714,
    // e.g. Standup L-Set Reactor Efficiency = −2%) in the live SDE. We deliberately
    // ignore it to honour the "reactions have no ME" rule — revisit if reaction-rig
    // material is ever modelled. Reactions also have no structure/rig job-cost role
    // bonus (only a time bonus, and only on the Tatara), so cost stays 0.
    const te = reductionPct(
      val(structureAttrs, ATTR.reactionTimeBonus, 1),
      rigAttrs,
      ATTR.rigReactionTime,
      securityClass,
    );
    return { me: 0, te, costBonus: 0 };
  }

  // Manufacturing (and science): material, time, and job-fee role bonuses, each
  // composed with the matching rig bonus.
  return {
    me: reductionPct(val(structureAttrs, ATTR.engMaterialBonus, 1), rigAttrs, ATTR.rigMfgMaterial, securityClass),
    te: reductionPct(val(structureAttrs, ATTR.engTimeBonus, 1), rigAttrs, ATTR.rigMfgTime, securityClass),
    costBonus: reductionPct(val(structureAttrs, ATTR.engCostBonus, 1), rigAttrs, ATTR.rigMfgCost, securityClass),
  };
}
