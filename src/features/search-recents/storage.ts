// localStorage helpers for the search-recents slice. Pure functions —
// no React. Cap at MAX entries; newer entries replace older duplicates so
// the most recently-clicked row floats to the top.

import { z } from 'zod';
import type { SearchResult } from '@/search';

const STORAGE_KEY = 'lgi:search:recents';
const MAX_RECENTS = 10;

// What gets persisted is a thin subset of SearchResult — re-emitted to
// the dropdown verbatim when the user refocuses an empty input. Storing
// `kind` lets the dropdown re-tone the icon, while `originKind` records
// which source produced the row so future cleanup logic can target one
// kind specifically without parsing strings. `typeId` is kept so a recent
// row that maps to an EVE type still renders its icon (else it would fall
// back to the `iconText` glyph it was stored with).
type StoredRecent = Pick<
  SearchResult,
  'kind' | 'id' | 'label' | 'sub' | 'href' | 'iconText' | 'iconTone' | 'typeId'
>;

// localStorage is an untrusted boundary (another tab, an old build, a user
// poking at devtools), so validate every stored row with Zod rather than a
// hand-rolled typeof guard — it also type-checks the optional display fields
// the old guard skipped.
const storedRecentSchema = z.object({
  kind: z.string(),
  id: z.string(),
  label: z.string(),
  sub: z.string().optional(),
  href: z.string(),
  iconText: z.string().optional(),
  iconTone: z.string().optional(),
  typeId: z.number().optional(),
});

function safeStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// Recent kinds whose row maps to a real EVE type and therefore renders the item's
// image (via TypeIcon). Blueprints are the only such kind today.
const ITEM_KINDS = new Set(['blueprint']);

// An item-bearing recent MUST carry a typeId to render its image. A stored row of
// that kind without one is a stale entry from before the typeId was recorded —
// drop it so it never falls back to a meaningless monogram instead of the icon.
function rendersIcon(r: StoredRecent): boolean {
  return !ITEM_KINDS.has(r.kind) || r.typeId != null;
}

/**
 * Reads and validates browser-local search recents, returning an empty list for malformed or
 * unavailable storage.
 */
export function readRecents(): SearchResult[] {
  return readStored()
    .slice(0, MAX_RECENTS)
    .map((r) => ({
      ...r,
      kind: 'recent',
      originKind: r.kind,
    }));
}

/** Moves one search selection to the front of the bounded, deduplicated recent list. */
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
      typeId: result.typeId,
    },
    ...without,
  ].slice(0, MAX_RECENTS);
  store.setItem(STORAGE_KEY, JSON.stringify(next));
}

/** Removes all browser-local search recents without affecting other preferences. */
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
    // Drop malformed rows AND stale item rows that predate the typeId — both via
    // the same gate, so a later pushRecent rewrites a cleaned list (self-purging).
    return parsed.filter(isStoredRecent).filter(rendersIcon);
  } catch {
    return [];
  }
}

function isStoredRecent(value: unknown): value is StoredRecent {
  return storedRecentSchema.safeParse(value).success;
}

/**
 * Test-only preference internals exposed for deterministic storage and key-contract verification;
 * production code must not consume this object.
 */
export const __TEST_ONLY__ = {
  STORAGE_KEY,
  MAX_RECENTS,
};
