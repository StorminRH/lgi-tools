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
