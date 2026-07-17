// localStorage-backed "recently viewed blueprints" for the Industry Planner
// dashboard. The detail page records each blueprint it shows; the dashboard
// reads the list back. Pure of React — the merge logic is split out so it can
// be unit-tested without a DOM. This is genuinely real (unlike the dashboard's
// favorites/active-builds placeholders), needing no DB or auth.

const STORAGE_KEY = 'lgi:industry:recent-blueprints';
const MAX_RECENT = 8;

/** Browser-persisted recent blueprint identity, product identity, name, and absolute visit time. */
export type RecentBlueprint = {
  typeId: number; // the blueprint type id (the /industry/[id] route param)
  productTypeId: number; // the produced item — used for the row icon, not the blueprint scroll
  name: string; // the produced item's name, for the row label
};

/**
 * Newest first, deduped by typeId (a re-view floats it back to the top),
 * capped at MAX_RECENT. Pure — the storage wrappers below delegate here.
 */
export function mergeRecent(
  list: RecentBlueprint[],
  entry: RecentBlueprint,
  max: number = MAX_RECENT,
): RecentBlueprint[] {
  const without = list.filter((r) => r.typeId !== entry.typeId);
  return [entry, ...without].slice(0, max);
}

function safeStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Validates the persisted recent-blueprint shape before browser storage data is trusted. */
export function isRecentBlueprint(value: unknown): value is RecentBlueprint {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.typeId === 'number' &&
    typeof r.productTypeId === 'number' &&
    typeof r.name === 'string'
  );
}

/**
 * Parse a raw localStorage string into the recent list: a JSON array of valid
 * RecentBlueprint entries, foreign/malformed entries dropped, capped at
 * MAX_RECENT. Any parse failure (or a null/empty string) yields []. Pure — no
 * storage, so the validation is unit-testable without a DOM.
 */
export function parseRecentBlueprints(raw: string | null): RecentBlueprint[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecentBlueprint).slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

/**
 * Reads, validates, and recency-sorts the browser's recent blueprint list; malformed storage
 * yields an empty list.
 */
export function readRecentBlueprints(): RecentBlueprint[] {
  const store = safeStorage();
  if (!store) return [];
  return parseRecentBlueprints(store.getItem(STORAGE_KEY));
}

/**
 * Moves one blueprint to the front of the browser's bounded recents list and persists the
 * deduplicated result.
 */
export function recordRecentBlueprint(entry: RecentBlueprint): void {
  const store = safeStorage();
  if (!store) return;
  const next = mergeRecent(readRecentBlueprints(), entry);
  store.setItem(STORAGE_KEY, JSON.stringify(next));
}
