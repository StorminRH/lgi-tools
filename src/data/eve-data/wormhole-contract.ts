/** Pure shared wormhole code and jump-size vocabulary for the codex and chain boundary. */

/** Exhaustive jump-size classes derived from SDE maximum jumpable mass. */
export const WORMHOLE_SIZE_CLASSES = ['S', 'M', 'L', 'XL'] as const;
/** One wormhole jump-size class. */
export type WormholeSizeClass = (typeof WORMHOLE_SIZE_CLASSES)[number];

/** Canonical far-side wormhole code; never a stand-in for an unidentified type. */
export const FAR_SIDE_WORMHOLE_CODE = 'K162';

const TYPED_WORMHOLE_CODE = /^[A-Z]\d{3}$/;

/** True when `value` is the far-side code or an uppercase letter followed by three digits. */
export function isWormholeTypeCode(value: string): boolean {
  return value === FAR_SIDE_WORMHOLE_CODE || TYPED_WORMHOLE_CODE.test(value);
}
