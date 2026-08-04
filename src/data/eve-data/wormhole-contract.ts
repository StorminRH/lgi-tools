// The pure wormhole vocabulary shared by the SDE-derived client codex, its wire
// validator, and the collaborative chain boundary in convex/. It holds no SDE
// lookup, no database access, and no framework import, so both runtimes can
// depend on the same stable identity rules without either owning the other.

/** Wormhole jump-size vocabulary derived from the SDE's maximum jumpable mass. */
export const WORMHOLE_SIZE_CLASSES = ['S', 'M', 'L', 'XL'] as const;

/** One wormhole jump-size class. */
export type WormholeSizeClass = (typeof WORMHOLE_SIZE_CLASSES)[number];

/**
 * Observed mass-stability vocabulary for one wormhole connection. Null on a
 * stored row means "not yet observed" and is outside this tuple — freshness is
 * a human observation, never a fabricated default.
 */
export const CONNECTION_MASS_STATES = ['stable', 'reduced', 'critical'] as const;

/** One observed connection mass state. */
export type ConnectionMassState = (typeof CONNECTION_MASS_STATES)[number];

/** Spawn-mass variance applied to non-regenerating wormhole estimates. */
export const WORMHOLE_MASS_VARIANCE = 0.1;

/** Remaining-mass fraction intervals implied by each observed shake state. */
export const WORMHOLE_MASS_STATE_THRESHOLDS = {
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
    entry.massRegen > 0
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
 * The far-side wormhole code. K162 is a real code with its own signature identity — it is never a
 * stand-in for an unidentified wormhole, which stores a null type code instead.
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
 * also admits the far-side {@link FAR_SIDE_WORMHOLE_CODE}. Codes — not SDE type IDs — are the stable
 * vocabulary shared by stored observations, because a type ID is versioned by one SDE build.
 */
export function isWormholeTypeCode(value: string): boolean {
  return WORMHOLE_TYPE_CODE.test(value);
}
