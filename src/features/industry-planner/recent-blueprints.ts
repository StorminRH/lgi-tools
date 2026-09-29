const STORAGE_KEY = 'lgi:industry:recent-blueprints';
const MAX_RECENT = 8;

export type RecentBlueprint = {
  typeId: number;
  productTypeId: number;
  name: string;
};

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

export function isRecentBlueprint(value: unknown): value is RecentBlueprint {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.typeId === 'number' &&
    typeof r.productTypeId === 'number' &&
    typeof r.name === 'string'
  );
}

export function parseRecentBlueprints(raw: string | null, max: number = MAX_RECENT): RecentBlueprint[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecentBlueprint).slice(0, max);
  } catch {
    return [];
  }
}

/** A stored list of blueprints: the recents, the research watchlist. */
export function readBlueprintList(key: string, max: number): RecentBlueprint[] {
  const store = safeStorage();
  if (!store) return [];
  return parseRecentBlueprints(store.getItem(key), max);
}

export function writeBlueprintList(key: string, list: RecentBlueprint[]): void {
  safeStorage()?.setItem(key, JSON.stringify(list));
}

export function readRecentBlueprints(): RecentBlueprint[] {
  return readBlueprintList(STORAGE_KEY, MAX_RECENT);
}

export function recordRecentBlueprint(entry: RecentBlueprint): void {
  writeBlueprintList(STORAGE_KEY, mergeRecent(readRecentBlueprints(), entry));
}
