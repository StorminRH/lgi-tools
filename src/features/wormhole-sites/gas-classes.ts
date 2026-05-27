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

export interface ClassRange {
  min: WormholeClass;
  max: WormholeClass;
}

const CLASS_ORDER: Record<WormholeClass, number> = {
  C1: 1, C2: 2, C3: 3, C4: 4, C5: 5, C6: 6,
};

const ALL_CLASSES: WormholeClass[] = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'];

export function gasClassRange(name: string): ClassRange | null {
  // Order matters — "Core" appears before "Frontier" alphabetically but the
  // ranges don't overlap, so the order of the three branches is purely a
  // readability choice (widest-range first).
  if (name.includes('Perimeter')) return { min: 'C1', max: 'C6' };
  if (name.includes('Frontier'))  return { min: 'C3', max: 'C6' };
  if (name.includes('Core'))      return { min: 'C5', max: 'C6' };
  return null;
}

export function formatClassRange(range: ClassRange): string {
  if (range.min === range.max) return range.min;
  return `${range.min}–${range.max}`;
}

export function classRangeIncludes(range: ClassRange, cls: WormholeClass): boolean {
  return CLASS_ORDER[cls] >= CLASS_ORDER[range.min] && CLASS_ORDER[cls] <= CLASS_ORDER[range.max];
}

// Expand a range to the array of classes it covers. Useful when a caller
// wants to drop the range and treat each class as a discrete possibility.
export function classRangeToList(range: ClassRange): WormholeClass[] {
  return ALL_CLASSES.filter((c) => classRangeIncludes(range, c));
}
