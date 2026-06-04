// Shapes for per-NPC combat stats computed from raw EVE SDE attributes.
// Generic across sleepers, mission rats, incursion NPCs, abyssal NPCs —
// anything with a type_dogma attributes row gets the same shape.

export interface DamageBreakdown {
  em: number;
  therm: number;
  kin: number;
  exp: number;
  total: number;
}

export interface CombatStats {
  turret: { dps: DamageBreakdown; alpha: DamageBreakdown };
  missile: { dps: DamageBreakdown; alpha: DamageBreakdown };
  total: { dps: number; alpha: number };
  hp: {
    shield: number;
    armor: number;
    structure: number;
    // Omni-resist EHP across armor + structure. Shield is excluded by
    // convention because every sleeper in the wormhole-sites dataset
    // is armor-tanked; Drifters do carry shield in the SDE but the Sheet's
    // calc tab also omits shield from total EHP. See math.ts for the why.
    ehp: number;
    // Snapshot-shape resists (integer percentages, like the Sheet stores).
    // Per-layer arrays in [em, exp, kin, therm] order.
    shieldRes: { em: number; exp: number; kin: number; therm: number };
    armorRes: { em: number; exp: number; kin: number; therm: number };
  };
  ewar: {
    scram: number;
    web: number;
    neutAmount: number;
    neutDuration: number;
    neutCount: number;
    rrepAmount: number;
    rrepDuration: number;
    rrepCount: number;
  };
  movement: {
    sigRadius: number;
    maxVelocity: number;
    orbitDistance: number;
    orbitVelocity: number;
  };
}

// Shape that mirrors the persisted `waves.*` aggregate columns being dropped
// in 2.7.1. Recomputed live in queries.ts via `summariseWave`.
export interface WaveTotals {
  dpsTotal: number;
  alphaTotal: number;
  ehpTotal: number;
  ewScram: number;
  ewWeb: number;
  ewNeut: number;
  ewRrep: number;
}
