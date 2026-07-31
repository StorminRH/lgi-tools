/** Exhaustive wormhole jump-size vocabulary shared by codex and chain data. */
export const WORMHOLE_SIZE_CLASSES = ['S', 'M', 'L', 'XL'] as const;

/** One wormhole jump-size class. */
export type WormholeSizeClass = (typeof WORMHOLE_SIZE_CLASSES)[number];

/** Canonical far-side code, which is a real type rather than an unknown marker. */
export const FAR_SIDE_WORMHOLE_CODE = 'K162';

const WORMHOLE_TYPE_CODE = /^[A-Z]\d{3}$/;

/** Returns whether a value is a canonical wormhole type code. */
export function isWormholeTypeCode(value: string): boolean {
  return value === FAR_SIDE_WORMHOLE_CODE || WORMHOLE_TYPE_CODE.test(value);
}
