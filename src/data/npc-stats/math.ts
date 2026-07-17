// Pure formulas for per-NPC combat stats. No DB imports — takes a flat
// `{ attrId: value }` map and returns typed shapes. Spec is the
// historical snapshot fixtures + spot-checks recorded in math.test.ts.
//
// SDE attribute IDs that show up here are real CCP IDs from dgmAttributeTypes.
// The Sheet's column *labels* for per-damage-type DPS are sometimes off (it
// labels SDE attr 118 "Therm" when it's actually Explosive), so we expose
// per-type breakdown using real SDE semantics. Totals match the Sheet either
// way and that's what the snapshot tests assert.

import type { AttrMap } from '@/data/eve-data/types';
import type { CombatStats, DamageBreakdown, WaveTotals } from './types';

const ATTR = {
  // Turret / weapon
  rateOfFire: 51, // ms per cycle
  turretDamageMult: 64,
  damageEm: 114,
  damageTherm: 116,
  damageKin: 117,
  damageExp: 118,
  // Missile
  missileTypeId: 507,
  missileRateOfFire: 506, // ms per cycle (on the sleeper, not the missile)
  missileDamageMult: 212, // on the sleeper
  // HP
  structureHp: 9,
  shieldHp: 263,
  armorHp: 265,
  // Resists are stored as "fraction passing through" (0.25 = 25% passes,
  // i.e. 75% resisted). Defaults to 1.0 if missing (no resistance).
  shieldResEm: 271,
  shieldResExp: 272,
  shieldResKin: 273,
  shieldResTherm: 274,
  armorResEm: 267,
  armorResExp: 268,
  armorResKin: 269,
  armorResTherm: 270,
  // EWAR
  webSpeedFactor: 20, // negative %, e.g. -60
  warpScramCount: 105,
  neutAmount: 97,
  neutDuration: 98, // ms
  rrepAmount: 1455,
  rrepDuration: 1454, // ms
  // Movement
  maxVelocity: 37,
  sigRadius: 552,
  orbitDistance: 416,
  orbitVelocity: 508,
} as const;

// The Sheet's Calculations tab derives neut/rrep "count" from amount by
// dividing by 10 — a baseline cycle normalization. Every neut/rrep-carrying
// sleeper in the 2.6 snapshot satisfies this (e.g. Sleepless Outguard
// neutAmount=100 → neutCount=10; Sleepless Preserver rrepAmount=650 →
// rrepCount=65). Keeping it as a constant so the convention is one place.
const NEUT_RREP_COUNT_DIVISOR = 10;

const ZERO_DAMAGE: DamageBreakdown = { em: 0, therm: 0, kin: 0, exp: 0, total: 0 };

function val(attrs: AttrMap, id: number, fallback = 0): number {
  const v = attrs[id];
  return v === undefined ? fallback : v;
}

function damageQuad(attrs: AttrMap): DamageBreakdown {
  const em = val(attrs, ATTR.damageEm);
  const therm = val(attrs, ATTR.damageTherm);
  const kin = val(attrs, ATTR.damageKin);
  const exp = val(attrs, ATTR.damageExp);
  return { em, therm, kin, exp, total: em + therm + kin + exp };
}

function scaleDamage(d: DamageBreakdown, mult: number): DamageBreakdown {
  return {
    em: d.em * mult,
    therm: d.therm * mult,
    kin: d.kin * mult,
    exp: d.exp * mult,
    total: d.total * mult,
  };
}

function divideDamage(d: DamageBreakdown, secs: number): DamageBreakdown {
  return {
    em: d.em / secs,
    therm: d.therm / secs,
    kin: d.kin / secs,
    exp: d.exp / secs,
    total: d.total / secs,
  };
}

function computeTurretDps(attrs: AttrMap): {
  dps: DamageBreakdown;
  alpha: DamageBreakdown;
} {
  const mult = val(attrs, ATTR.turretDamageMult);
  const rofMs = val(attrs, ATTR.rateOfFire);
  if (mult <= 0 || rofMs <= 0) return { dps: ZERO_DAMAGE, alpha: ZERO_DAMAGE };
  const alpha = scaleDamage(damageQuad(attrs), mult);
  const dps = divideDamage(alpha, rofMs / 1000);
  return { dps, alpha };
}

function computeMissileDps(
  sleeperAttrs: AttrMap,
  missileAttrs: AttrMap | null,
): { dps: DamageBreakdown; alpha: DamageBreakdown } {
  if (!missileAttrs) return { dps: ZERO_DAMAGE, alpha: ZERO_DAMAGE };
  // Stationary structures (sentry towers) ship the missile attributes in the
  // SDE but don't actually fire missiles in-game. The Sheet's calc tab agrees
  // — every zero-velocity NPC has missile DPS = 0. Use maxVelocity as the
  // structure-vs-ship discriminator since sentries are always stationary.
  if (val(sleeperAttrs, ATTR.maxVelocity) <= 0) {
    return { dps: ZERO_DAMAGE, alpha: ZERO_DAMAGE };
  }
  const mult = val(sleeperAttrs, ATTR.missileDamageMult);
  const rofMs = val(sleeperAttrs, ATTR.missileRateOfFire);
  if (mult <= 0 || rofMs <= 0) return { dps: ZERO_DAMAGE, alpha: ZERO_DAMAGE };
  // Sleeper-vs-sleeper missile damage is treated as fully-applied here:
  // the EVE damage-application formula `min(1, sigRad/explRad,
  // (sigRad/explRad)·(explVel/maxVel)^DRF)` caps near 1 for sleeper-sized
  // targets, so we use factor = 1.
  const alpha = scaleDamage(damageQuad(missileAttrs), mult);
  const dps = divideDamage(alpha, rofMs / 1000);
  return { dps, alpha };
}

// The four EVE damage types (EM, Explosive, Kinetic, Thermal) as a fixed tuple —
// every resist array in this file is exactly these four, so the shape is typed
// rather than a bare number[] whose elements would each read as possibly-undefined.
type ResistArray = readonly [number, number, number, number];

// Pass-through = 1.0 on all four types: the "no resistance" default used when an
// HP layer is absent (see computeHp).
const NO_RESIST_PASSES: ResistArray = [1, 1, 1, 1];

function omniLayerEhp(hp: number, passes: ResistArray): number {
  if (hp <= 0) return 0;
  const avg = (passes[0] + passes[1] + passes[2] + passes[3]) / 4;
  if (avg <= 0) return 0; // 100% resist on every damage type — infinite EHP, treat as 0 sentinel.
  return hp / avg;
}

function resistsToPct(passes: ResistArray): {
  em: number;
  exp: number;
  kin: number;
  therm: number;
} {
  // Snapshot stores resists as integer percentages (75 = 75% resist).
  // SDE attr is fraction-passing-through (0.25 = 25% passes).
  return {
    em: Math.round((1 - passes[0]) * 100),
    exp: Math.round((1 - passes[1]) * 100),
    kin: Math.round((1 - passes[2]) * 100),
    therm: Math.round((1 - passes[3]) * 100),
  };
}

function shieldResistsArray(attrs: AttrMap, fallback: number): ResistArray {
  return [
    val(attrs, ATTR.shieldResEm, fallback),
    val(attrs, ATTR.shieldResExp, fallback),
    val(attrs, ATTR.shieldResKin, fallback),
    val(attrs, ATTR.shieldResTherm, fallback),
  ];
}

function armorResistsArray(attrs: AttrMap, fallback: number): ResistArray {
  return [
    val(attrs, ATTR.armorResEm, fallback),
    val(attrs, ATTR.armorResExp, fallback),
    val(attrs, ATTR.armorResKin, fallback),
    val(attrs, ATTR.armorResTherm, fallback),
  ];
}

function computeHp(attrs: AttrMap): CombatStats['hp'] {
  const shieldHp = val(attrs, ATTR.shieldHp);
  const armorHp = val(attrs, ATTR.armorHp);
  const structureHp = val(attrs, ATTR.structureHp);
  // If the resist attribute is missing entirely we treat it as "no resist"
  // (pass-through = 1.0). When the HP layer itself is 0 the snapshot also
  // reports 0 resists, so we use 1.0 (full pass-through, displayed as 0%
  // resist) only when HP > 0; otherwise zeros.
  const shieldPasses = shieldHp > 0 ? shieldResistsArray(attrs, 1) : NO_RESIST_PASSES;
  const armorPasses = armorHp > 0 ? armorResistsArray(attrs, 1) : NO_RESIST_PASSES;

  // Snapshot's `ehp` excludes shield (every sleeper in the dataset is
  // armor-tanked; Drifters carry shield in raw SDE but the Sheet's calc tab
  // omits it from total EHP — see math.test.ts for the validated convention).
  const armorEhp = omniLayerEhp(armorHp, armorPasses);
  const ehp = armorEhp + structureHp;

  return {
    shield: shieldHp,
    armor: armorHp,
    structure: structureHp,
    ehp,
    shieldRes: shieldHp > 0
      ? resistsToPct(shieldPasses)
      : { em: 0, exp: 0, kin: 0, therm: 0 },
    armorRes: armorHp > 0
      ? resistsToPct(armorPasses)
      : { em: 0, exp: 0, kin: 0, therm: 0 },
  };
}

function computeEwar(attrs: AttrMap): CombatStats['ewar'] {
  const neutAmount = val(attrs, ATTR.neutAmount);
  const rrepAmount = val(attrs, ATTR.rrepAmount);
  return {
    scram: val(attrs, ATTR.warpScramCount),
    web: val(attrs, ATTR.webSpeedFactor),
    neutAmount,
    neutDuration: val(attrs, ATTR.neutDuration),
    neutCount: Math.floor(neutAmount / NEUT_RREP_COUNT_DIVISOR),
    rrepAmount,
    rrepDuration: val(attrs, ATTR.rrepDuration),
    rrepCount: Math.floor(rrepAmount / NEUT_RREP_COUNT_DIVISOR),
  };
}

function computeMovement(attrs: AttrMap): CombatStats['movement'] {
  return {
    sigRadius: val(attrs, ATTR.sigRadius),
    maxVelocity: val(attrs, ATTR.maxVelocity),
    orbitDistance: val(attrs, ATTR.orbitDistance),
    orbitVelocity: val(attrs, ATTR.orbitVelocity),
  };
}

export function composeCombatStats(
  sleeperAttrs: AttrMap,
  missileAttrs: AttrMap | null = null,
): CombatStats {
  const turret = computeTurretDps(sleeperAttrs);
  const missile = computeMissileDps(sleeperAttrs, missileAttrs);
  const hp = computeHp(sleeperAttrs);
  const ewar = computeEwar(sleeperAttrs);
  const movement = computeMovement(sleeperAttrs);
  return {
    turret,
    missile,
    total: {
      dps: turret.dps.total + missile.dps.total,
      alpha: turret.alpha.total + missile.alpha.total,
    },
    hp,
    ewar,
    movement,
  };
}

/**
 * Look up the missile typeId an NPC carries (or null if it doesn't shoot
 * missiles). Pure helper — callers use it to know which missile attrs to
 * pass into `composeCombatStats`.
 */
export function missileTypeIdFor(sleeperAttrs: AttrMap): number | null {
  const id = sleeperAttrs[ATTR.missileTypeId];
  return id === undefined || id === 0 ? null : Math.round(id);
}

/**
 * Sum per-NPC stats × quantity across a wave. Mirrors the persisted
 * `waves.dps_total`, `alpha_total`, `ehp_total`, `ew_scram`, `ew_web`,
 * `ew_neut`, `ew_rrep` columns being dropped in 2.7.1.
 */
export function summariseWave(
  npcs: Array<{ stats: CombatStats; quantity: number }>,
): WaveTotals {
  let dpsTotal = 0;
  let alphaTotal = 0;
  let ehpTotal = 0;
  let ewScram = 0;
  let ewWeb = 0;
  let ewNeut = 0;
  let ewRrep = 0;
  for (const { stats, quantity } of npcs) {
    dpsTotal += stats.total.dps * quantity;
    alphaTotal += stats.total.alpha * quantity;
    ehpTotal += stats.hp.ehp * quantity;
    ewScram += stats.ewar.scram * quantity;
    ewWeb += stats.ewar.web * quantity;
    ewNeut += stats.ewar.neutCount * quantity;
    ewRrep += stats.ewar.rrepCount * quantity;
  }
  return {
    dpsTotal: Math.round(dpsTotal),
    alphaTotal: Math.round(alphaTotal),
    ehpTotal: Math.round(ehpTotal),
    ewScram,
    ewWeb,
    ewNeut,
    ewRrep,
  };
}
