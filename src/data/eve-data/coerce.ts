export function intOrNull(v: unknown): number | null {
  return typeof v === 'number' ? Math.trunc(v) : null;
}

export function numOrNull(v: unknown): number | null {
  return typeof v === 'number' ? v : null;
}

export function strOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

export function boolOf(v: unknown): boolean {
  return v === true;
}

/** `v` when it is a non-null, non-array object, else null. */
export function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/** `fn` over each record entry of `list`; [] unless `list` is an array, and entries that are not records or that `fn` maps to null are skipped. */
export function mapRecords<T>(
  list: unknown,
  fn: (entry: Record<string, unknown>) => T | null,
): T[] {
  if (!Array.isArray(list)) return [];
  const out: T[] = [];
  for (const raw of list) {
    const entry = asRecord(raw);
    if (entry === null) continue;
    const mapped = fn(entry);
    if (mapped !== null) out.push(mapped);
  }
  return out;
}

/**
 * An SDE `dogmaAttributes` list `[{ attributeID, value }]` as `[id, value]`
 * pairs in input order, so a collected Map or object keeps the last value of a
 * repeated id. Entries without a numeric id and value are skipped.
 */
export function dogmaAttributePairs(
  list: unknown,
): Array<readonly [attributeId: number, value: number]> {
  return mapRecords(list, (entry) => {
    const attributeId = intOrNull(entry.attributeID);
    const value = numOrNull(entry.value);
    return attributeId === null || value === null ? null : ([attributeId, value] as const);
  });
}

export function localizedEn(v: unknown): string | null {
  return strOrNull(asRecord(v)?.en);
}
