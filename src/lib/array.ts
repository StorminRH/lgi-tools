// Tiny array helpers shared across data slices and features. Living in src/lib
// keeps them importable from both without crossing a boundary. Minimal by
// default — no lodash for two one-liners.

/** Drop duplicates, preserving first-seen order. */
export function dedupe<T>(items: T[]): T[] {
  return [...new Set(items)];
}

/** Split into fixed-size groups; the last group holds the remainder. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
