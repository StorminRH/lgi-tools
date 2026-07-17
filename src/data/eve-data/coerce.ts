// Field coercion helpers shared by the SDE parsers (types/blueprints in
// ingest.ts, universe in universe.ts). CCP's JSONL carries real JSON types
// (numbers, booleans, null, nested objects), so these just narrow a parsed
// field to the column's type, defaulting to null when absent/mistyped. Kept in
// their own module so both parsers can import them without one parser depending
// on the other.

/**
 * For integer / bigint columns. CCP ships some nominally-integer fields as
 * fractional numbers (e.g. a type's `basePrice` of 16873.5); a Postgres integer/
 * bigint column rejects those, so truncate toward zero — matching the old CSV
 * ingest's parseInt behavior.
 */
export function intOrNull(v: unknown): number | null {
  return typeof v === 'number' ? Math.trunc(v) : null;
}

/**
 * For doublePrecision columns and JSONB numeric values, where the fractional
 * part is meaningful (mass/volume, attribute defaults, a system's security
 * status, every dogma attribute value).
 */
export function numOrNull(v: unknown): number | null {
  return typeof v === 'number' ? v : null;
}

export function strOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

export function boolOf(v: unknown): boolean {
  return v === true;
}

/**
 * CCP localizes `name` / `description` / `displayName` / `operationName` /
 * `serviceName` as `{ en, de, … }`. We store the English string; returns null
 * when the object or its `en` key is missing.
 */
export function localizedEn(v: unknown): string | null {
  if (
    v &&
    typeof v === 'object' &&
    typeof (v as { en?: unknown }).en === 'string'
  ) {
    return (v as { en: string }).en;
  }
  return null;
}
