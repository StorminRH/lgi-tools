// The pure wormhole vocabulary shared by the SDE-derived client codex, its wire
// validator, and the collaborative chain boundary in convex/. It holds no SDE
// lookup, no database access, and no framework import, so both runtimes can
// depend on the same stable identity rules without either owning the other.

/** Wormhole jump-size vocabulary derived from the SDE's maximum jumpable mass. */
export const WORMHOLE_SIZE_CLASSES = ['S', 'M', 'L', 'XL'] as const;

/** One wormhole jump-size class. */
export type WormholeSizeClass = (typeof WORMHOLE_SIZE_CLASSES)[number];

/**
 * The far-side wormhole code. K162 is a real code with its own signature identity — it is never a
 * stand-in for an unidentified wormhole, which stores a null type code instead.
 */
export const FAR_SIDE_WORMHOLE_CODE = 'K162';

const WORMHOLE_TYPE_CODE = /^[A-Z]\d{3}$/;

/**
 * Recognises a canonical wormhole type code: an uppercase letter followed by three digits, which
 * also admits the far-side {@link FAR_SIDE_WORMHOLE_CODE}. Codes — not SDE type IDs — are the stable
 * vocabulary shared by stored observations, because a type ID is versioned by one SDE build.
 */
export function isWormholeTypeCode(value: string): boolean {
  return WORMHOLE_TYPE_CODE.test(value);
}
