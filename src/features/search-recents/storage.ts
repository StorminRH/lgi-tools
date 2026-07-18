// localStorage helpers for the search-recents slice. Pure functions —
// no React. Cap at MAX entries; newer entries replace older duplicates so
// the most recently-clicked row floats to the top.

import { z } from 'zod';
import { blueprintImage, type EveImageDescriptor } from '@/data/eve-data/type-images';
import type { SearchResult } from '@/search';

const STORAGE_KEY = 'lgi:search:recents';
const MAX_RECENTS = 10;

// What gets persisted is a thin subset of SearchResult — re-emitted to
// the dropdown verbatim when the user refocuses an empty input. Storing
// `kind` lets the dropdown re-tone the icon, while `originKind` records
// which source produced the row so future cleanup logic can target one
// kind specifically without parsing strings. `typeId` preserves the source's
// product/type identity; blueprint image intent is reconstructed from the stable
// `blueprint:<id>` row id on read rather than persisting a rendition string.
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

const BLUEPRINT_KIND = 'blueprint';
const BLUEPRINT_ID_PREFIX = 'blueprint:';

function storedBlueprintTypeId(r: StoredRecent): number | undefined {
  if (r.kind !== BLUEPRINT_KIND || !r.id.startsWith(BLUEPRINT_ID_PREFIX)) return undefined;
  const typeId = Number(r.id.slice(BLUEPRINT_ID_PREFIX.length));
  return Number.isSafeInteger(typeId) && typeId > 0 ? typeId : undefined;
}

function recentImage(r: StoredRecent): EveImageDescriptor | undefined {
  const blueprintTypeId = storedBlueprintTypeId(r);
  return blueprintTypeId !== undefined ? blueprintImage(blueprintTypeId) : undefined;
}

// A blueprint recent must retain its product typeId for compatibility and carry
// a valid stable blueprint id so replay can reconstruct the blueprint rendition.
function rendersIcon(r: StoredRecent): boolean {
  return r.kind !== BLUEPRINT_KIND || (r.typeId !== undefined && recentImage(r) !== undefined);
}

/**
 * Reads and validates browser-local search recents, returning an empty list for malformed or
 * unavailable storage.
 */
export function readRecents(): SearchResult[] {
  return readStored()
    .slice(0, MAX_RECENTS)
    .map((r) => {
      const icon = recentImage(r);
      return {
        ...r,
        ...(icon ? { icon } : {}),
        kind: 'recent',
        originKind: r.kind,
      };
    });
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
