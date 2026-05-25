// localStorage helpers for the search-recents slice. Pure functions —
// no React. Cap at MAX entries; newer entries replace older duplicates so
// the most recently-clicked row floats to the top.

import type { SearchResult } from '@/data/search';

const STORAGE_KEY = 'lgi:search:recents';
const MAX_RECENTS = 10;

// What gets persisted is a thin subset of SearchResult — re-emitted to
// the dropdown verbatim when the user refocuses an empty input. Storing
// `kind` lets the dropdown re-tone the icon, while `originKind` records
// which source produced the row so future cleanup logic can target one
// kind specifically without parsing strings.
type StoredRecent = Pick<
  SearchResult,
  'kind' | 'id' | 'label' | 'sub' | 'href' | 'iconText' | 'iconTone'
>;

function safeStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readRecents(): SearchResult[] {
  const store = safeStorage();
  if (!store) return [];
  const raw = store.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isStoredRecent)
      .slice(0, MAX_RECENTS)
      .map((r) => ({
        ...r,
        kind: 'recent',
        originKind: r.kind,
      }));
  } catch {
    return [];
  }
}

export function pushRecent(result: SearchResult): void {
  if (result.kind === 'recent') return;
  if (result.disabled) return;
  const store = safeStorage();
  if (!store) return;
  const current = readStored();
  const without = current.filter((r) => r.id !== result.id);
  const next: StoredRecent[] = [
    {
      kind: result.kind,
      id: result.id,
      label: result.label,
      sub: result.sub,
      href: result.href,
      iconText: result.iconText,
      iconTone: result.iconTone,
    },
    ...without,
  ].slice(0, MAX_RECENTS);
  store.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function clearRecents(): void {
  const store = safeStorage();
  if (!store) return;
  store.removeItem(STORAGE_KEY);
}

function readStored(): StoredRecent[] {
  const store = safeStorage();
  if (!store) return [];
  const raw = store.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredRecent);
  } catch {
    return [];
  }
}

function isStoredRecent(value: unknown): value is StoredRecent {
  if (typeof value !== 'object' || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.kind === 'string' &&
    typeof r.id === 'string' &&
    typeof r.label === 'string' &&
    typeof r.href === 'string'
  );
}

export const __TEST_ONLY__ = {
  STORAGE_KEY,
  MAX_RECENTS,
};
