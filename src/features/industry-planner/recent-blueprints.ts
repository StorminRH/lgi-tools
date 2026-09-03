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

export function readRecentBlueprints(): RecentBlueprint[] {
  const store = safeStorage();
  if (!store) return [];
  return parseRecentBlueprints(store.getItem(STORAGE_KEY));
}

export function recordRecentBlueprint(entry: RecentBlueprint): void {
  const store = safeStorage();
  if (!store) return;
  const next = mergeRecent(readRecentBlueprints(), entry);
  store.setItem(STORAGE_KEY, JSON.stringify(next));
}
