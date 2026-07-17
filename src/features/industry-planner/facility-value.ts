// The build/reaction facility <select>'s option value is an encoded string —
// `structure:<id>`, `station:<id>`, `add-custom`, or empty. This module owns the
// encode/decode both slots share, so the shells stay a flat dispatch over the
// parsed intent instead of re-deriving the string prefixes inline. Pure.

/** Selected build facility with stable identity, label, source kind, and applicable bonus inputs. */
export type FacilitySelection =
  | { kind: 'add-custom' }
  | { kind: 'structure'; id: string }
  | { kind: 'station'; id: number }
  | { kind: 'clear' };

/**
 * Decode a facility <select> value into its intent. An unrecognised value (incl.
 * the empty "— none —" option) is a clear.
 */
export function parseFacilityValue(value: string): FacilitySelection {
  if (value === 'add-custom') return { kind: 'add-custom' };
  if (value.startsWith('structure:')) return { kind: 'structure', id: value.slice('structure:'.length) };
  if (value.startsWith('station:')) return { kind: 'station', id: Number(value.slice('station:'.length)) };
  return { kind: 'clear' };
}

/**
 * Encode the current selection back into the <select>'s controlled value: a
 * picked structure wins over a station (they're mutually exclusive), else empty.
 */
export function facilityValueFor(
  selectedStructure: { id: string } | null,
  station: { id: number } | null,
): string {
  if (selectedStructure) return `structure:${selectedStructure.id}`;
  if (station) return `station:${station.id}`;
  return '';
}

/**
 * Look a structure up by id in a list, coalescing a miss to null — the form the
 * slot setters take (find returns `undefined`). Shared by the build and reaction
 * facility selects.
 */
export function structureById<T extends { id: string }>(structures: T[], id: string): T | null {
  return structures.find((s) => s.id === id) ?? null;
}
