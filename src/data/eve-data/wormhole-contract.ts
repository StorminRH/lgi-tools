// The pure wormhole vocabulary shared by the SDE-derived client codex, its wire
// validator, and the collaborative chain boundary in convex/. It holds no SDE
// lookup, no database access, and no framework import, so both runtimes can
// depend on the same stable identity rules without either owning the other.

import { systemSecurityClass } from './security';

/** Wormhole jump-size vocabulary derived from the SDE's maximum jumpable mass. */
export const WORMHOLE_SIZE_CLASSES = ['S', 'M', 'L', 'XL'] as const;

/** One wormhole jump-size class. */
export type WormholeSizeClass = (typeof WORMHOLE_SIZE_CLASSES)[number];

/** Maps a maximum jump mass into the exhaustive wormhole size vocabulary. */
export function wormholeSizeClass(maxJumpMass: number): WormholeSizeClass {
  if (maxJumpMass <= 5_000_000) return 'S';
  if (maxJumpMass <= 62_000_000) return 'M';
  if (maxJumpMass <= 410_000_000) return 'L';
  return 'XL';
}

/** Closed show-info buckets for the space beyond one wormhole side. */
export const WORMHOLE_DESTINATION_HINTS = [
  'hisec',
  'lowsec',
  'nullsec',
  'unknown',
  'dangerous',
  'deadly',
  'thera',
  'pochven',
  'drifter',
] as const;

/** One stored destination-hint bucket. */
export type WormholeDestinationHint = (typeof WORMHOLE_DESTINATION_HINTS)[number];

/** Provenance tiers for connection identity facts and D16 observations. */
export const CONNECTION_PROVENANCES = [
  'jump-verified',
  'human',
  'confirmed',
  'assumed',
] as const;

/** One stored connection identity provenance tier. */
export type ConnectionProvenance = (typeof CONNECTION_PROVENANCES)[number];

/** SDE system fields needed to interpret one destination hint. */
export interface WormholeSystemClassFacts {
  readonly wormholeClassId: number | null;
  readonly securityStatus: number | null;
}

const HINT_CLASSES = {
  hisec: [7],
  lowsec: [8],
  nullsec: [9],
  unknown: [1, 2, 3, 13],
  dangerous: [4, 5],
  deadly: [6],
  thera: [12],
  pochven: [25],
} as const satisfies Record<
  Exclude<WormholeDestinationHint, 'drifter'>,
  readonly number[]
>;

const COVERED_DESTINATION_CLASSES = new Set<number>(
  Object.values(HINT_CLASSES).flat(),
);

/** Resolves a system's wormhole or known-space class ID without duplicating security thresholds. */
export function effectiveWormholeClassId(
  facts: WormholeSystemClassFacts,
): number | null {
  if (facts.wormholeClassId !== null) return facts.wormholeClassId;
  if (facts.securityStatus === null) return null;
  return {
    high: 7,
    low: 8,
    null: 9,
    wormhole: null,
  }[systemSecurityClass(facts.securityStatus, null)];
}

/**
 * Tests a show-info destination bucket against SDE system facts. Classes the
 * vocabulary cannot distinguish fail open so inference never discards a
 * credible signature on incomplete or future geography.
 */
export function hintAdmitsClass(
  hint: WormholeDestinationHint,
  destination: WormholeSystemClassFacts,
): boolean {
  const effectiveClassId = effectiveWormholeClassId(destination);

  if (effectiveClassId === null || !COVERED_DESTINATION_CLASSES.has(effectiveClassId)) {
    return true;
  }
  if (hint === 'drifter') return false;
  return (HINT_CLASSES[hint] as readonly number[]).includes(effectiveClassId);
}

/**
 * The single destination class a hint names, or `null` when the hint is a
 * bucket (C1–C3, C4–C5). Drifter returns 14 so the chip can reuse the existing
 * class ladder; the five complexes share one label.
 */
export function destinationHintSoleClassId(
  hint: WormholeDestinationHint,
): number | null {
  if (hint === 'drifter') return 14;
  const classes = HINT_CLASSES[hint];
  return classes.length === 1 ? classes[0]! : null;
}

/**
 * Observed mass-stability vocabulary for one wormhole connection. Null on a
 * stored row means "not yet observed" and is outside this tuple — freshness is
 * a human observation, never a fabricated default.
 */
export const CONNECTION_MASS_STATES = ['stable', 'reduced', 'critical'] as const;

/** One observed connection mass state. */
export type ConnectionMassState = (typeof CONNECTION_MASS_STATES)[number];

/** Spawn-mass variance applied to non-regenerating wormhole estimates. */
const WORMHOLE_MASS_VARIANCE = 0.1;

/** Remaining-mass fraction intervals implied by each observed shake state. */
const WORMHOLE_MASS_STATE_THRESHOLDS = {
  stable: { minFraction: 0.5, maxFraction: 1 },
  reduced: { minFraction: 0.1, maxFraction: 0.5 },
  critical: { minFraction: 0, maxFraction: 0.1 },
  unset: { minFraction: 0, maxFraction: 1 },
} as const satisfies Record<
  ConnectionMassState | 'unset',
  { readonly minFraction: number; readonly maxFraction: number }
>;

/** The codex-owned facts required to estimate remaining connection mass. */
export interface WormholeMassFacts {
  readonly totalMass: number;
  readonly massRegen: number;
}

/** Honest remaining-mass bounds in kilograms. */
export interface RemainingMassBounds {
  readonly minKg: number;
  readonly maxKg: number;
}

/**
 * Derives the shake-state-clamped remaining-mass interval, widened by the
 * per-hole spawn variance. Regenerating holes intentionally return no estimate:
 * regeneration makes a state-only remaining budget misleading.
 */
export function remainingMassBounds(
  entry: WormholeMassFacts | null | undefined,
  massState: ConnectionMassState | null,
): RemainingMassBounds | null {
  if (
    entry === null ||
    entry === undefined ||
    !Number.isFinite(entry.totalMass) ||
    entry.totalMass <= 0 ||
    !Number.isFinite(entry.massRegen) ||
    entry.massRegen !== 0
  ) {
    return null;
  }

  const threshold = WORMHOLE_MASS_STATE_THRESHOLDS[massState ?? 'unset'];
  return {
    minKg: Math.round(
      threshold.minFraction *
        (1 - WORMHOLE_MASS_VARIANCE) *
        entry.totalMass,
    ),
    maxKg: Math.round(
      threshold.maxFraction *
        (1 + WORMHOLE_MASS_VARIANCE) *
        entry.totalMass,
    ),
  };
}

/**
 * Applies only the observed travel since the latest shake-state anchor to the
 * shipped remaining-mass interval. Missing odometer fields represent an old
 * row with no observed travel; malformed counters return no estimate.
 */
export function remainingMassAfterTravel(
  entry: WormholeMassFacts | null | undefined,
  massState: ConnectionMassState | null,
  observedMassKg: number | null | undefined,
  observedMassAtStateKg: number | null | undefined,
): RemainingMassBounds | null {
  const bounds = remainingMassBounds(entry, massState);
  if (bounds === null) return null;
  if (
    (observedMassKg !== null &&
      observedMassKg !== undefined &&
      (!Number.isFinite(observedMassKg) || observedMassKg < 0)) ||
    (observedMassAtStateKg !== null &&
      observedMassAtStateKg !== undefined &&
      (!Number.isFinite(observedMassAtStateKg) || observedMassAtStateKg < 0))
  ) {
    return null;
  }

  if (
    observedMassKg !== null &&
    observedMassKg !== undefined &&
    observedMassAtStateKg !== null &&
    observedMassAtStateKg !== undefined &&
    observedMassKg < observedMassAtStateKg
  ) {
    return null;
  }

  const travelledKg = Math.max(
    0,
    (observedMassKg ?? 0) - (observedMassAtStateKg ?? 0),
  );
  return {
    minKg: Math.max(0, Math.round(bounds.minKg - travelledKg)),
    maxKg: Math.max(0, Math.round(bounds.maxKg - travelledKg)),
  };
}

/**
 * Classifies the SDE's stable system-ID partition. IDs below 31 million are
 * known space; IDs at or above it are J-space.
 *
 * Sibling classifier: `security.ts` `systemSecurityClass` answers the same
 * wormhole-vs-known-space question from `securityStatus`/`wormholeClassId`
 * row fields. Use that one when the SDE row is in hand; use this id-range
 * form only where no row is available (e.g. Convex mutations).
 */
export function isKnownSpaceSystemId(systemId: number): boolean {
  return systemId < 31_000_000;
}

/**
 * Current in-game Reliable Lifetime buckets for a wormhole connection. Null on
 * a stored row means unset; the four literals match show-info wording
 * (less than 1 day / less than 4 hours / less than 1 hour / expired).
 */
export const WORMHOLE_LIFE_STAGES = [
  'under_1_day',
  'under_4_hours',
  'under_1_hour',
  'expired',
] as const;

/** One observed wormhole life-stage bucket. */
export type WormholeLifeStage = (typeof WORMHOLE_LIFE_STAGES)[number];

/**
 * K162 — the incoming mouth. This is a real type with its own signature
 * identity, never a stand-in for an unidentified hole (`null`). Codex and
 * SDE still call this far-side; Atlas comments say incoming K162.
 */
export const FAR_SIDE_WORMHOLE_CODE = 'K162';

/**
 * Canonical wormhole type-code grammar: one uppercase letter followed by three digits. The wire
 * validator, SDE name extractor, and collaborative boundary all consume this one pattern so a
 * future widening cannot accept a code in one runtime that another rejects.
 */
export const WORMHOLE_TYPE_CODE = /^[A-Z]\d{3}$/;

/**
 * Recognises a canonical wormhole type code: an uppercase letter followed by three digits, which
 * also admits K162 ({@link FAR_SIDE_WORMHOLE_CODE}). Codes — not SDE type IDs — are the stable
 * vocabulary shared by stored observations, because a type ID is versioned by one SDE build.
 */
export function isWormholeTypeCode(value: string): boolean {
  return WORMHOLE_TYPE_CODE.test(value);
}
