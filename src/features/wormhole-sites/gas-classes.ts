import type { WormholeClass } from './types';

// Gas sites don't have a single canonical wormhole class in the data — the
// `wormhole_class` column is NULL for every gas row. In reality each gas
// signature spawns across a specific range of wormhole classes, determined
// by its name prefix (per the EVE wormhole sleeper signature spawn tables).
//
//   Perimeter (Barren, Minor, Ordinary, Sizeable, Token) → C1 – C6
//   Frontier  (Bountiful, Vast)                         → C3 – C6
//   Core      (Instrumental, Vital)                     → C5 – C6
//
// This helper centralises that mapping so card, table, and filter logic can
// all derive it from the site name without each having its own switch.

/** Inclusive wormhole-class bounds used by gas-site filtering and labels. */
export interface ClassRange {
  min: WormholeClass;
  max: WormholeClass;
}

const CLASS_ORDER: Record<WormholeClass, number> = {
  C1: 1, C2: 2, C3: 3, C4: 4, C5: 5, C6: 6,
};

/** Returns the inclusive wormhole-class range implied by a gas-site class label. */
export function gasClassRange(name: string): ClassRange | null {
  // Order matters — "Core" appears before "Frontier" alphabetically but the
  // ranges don't overlap, so the order of the three branches is purely a
  // readability choice (widest-range first).
  if (name.includes('Perimeter')) return { min: 'C1', max: 'C6' };
  if (name.includes('Frontier'))  return { min: 'C3', max: 'C6' };
  if (name.includes('Core'))      return { min: 'C5', max: 'C6' };
  return null;
}

/** Formats an inclusive wormhole-class range as one class or a compact class span. */
export function formatClassRange(range: ClassRange): string {
  if (range.min === range.max) return range.min;
  return `${range.min}–${range.max}`;
}

/** Returns whether an inclusive wormhole-class range contains the supplied class number. */
export function classRangeIncludes(range: ClassRange, cls: WormholeClass): boolean {
  return CLASS_ORDER[cls] >= CLASS_ORDER[range.min] && CLASS_ORDER[cls] <= CLASS_ORDER[range.max];
}
