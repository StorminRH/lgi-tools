import { useSyncExternalStore } from 'react';
import { z } from 'zod';

// The key the planner's landing page has always kept, so a returning
// pilot's recents are still there.
const STORAGE_KEY = 'lgi:industry:recent-blueprints';
const MAX_RECENT = 8;

const recentBlueprintSchema = z.object({
  typeId: z.number().int().positive(),
  productTypeId: z.number().int().positive(),
  name: z.string().min(1),
});

/** A blueprint opened in the planner on this device. */
export type RecentBlueprint = z.infer<typeof recentBlueprintSchema>;

const NONE: RecentBlueprint[] = [];
const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cached = NONE;

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function parse(raw: string | null): RecentBlueprint[] {
  if (!raw) return NONE;
  try {
    const stored: unknown = JSON.parse(raw);
    if (!Array.isArray(stored)) return NONE;
    return stored.flatMap((entry) => recentBlueprintSchema.safeParse(entry).data ?? []).slice(0, MAX_RECENT);
  } catch {
    return NONE;
  }
}

function snapshot(): RecentBlueprint[] {
  const raw = storage()?.getItem(STORAGE_KEY) ?? null;
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = parse(raw);
  }
  return cached;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const unread = (): RecentBlueprint[] | null => null;

/** The blueprints this device opened last, newest first; null until hydrated. */
export function useRecentBlueprints(): RecentBlueprint[] | null {
  return useSyncExternalStore<RecentBlueprint[] | null>(subscribe, snapshot, unread);
}

/** Puts a blueprint at the head of this device's recents. */
export function recordRecentBlueprint(entry: RecentBlueprint): void {
  const store = storage();
  if (!store) return;
  const next = [entry, ...snapshot().filter((r) => r.typeId !== entry.typeId)].slice(0, MAX_RECENT);
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    return;
  }
  for (const listener of [...listeners]) listener();
}
