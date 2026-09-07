import { z } from 'zod';
import { blueprintImage, type EveImageDescriptor } from '@/data/eve-data/type-images';
import type { SearchResult } from '@/platform/search';

const STORAGE_KEY = 'lgi:search:recents';
const MAX_RECENTS = 10;
const EMPTY_RECENTS: SearchResult[] = [];

const listeners = new Set<() => void>();
let cachedRaw: string | null | undefined;
let cachedSnapshot: SearchResult[] = EMPTY_RECENTS;

type StoredRecent = Pick<
  SearchResult,
  'kind' | 'id' | 'label' | 'sub' | 'href' | 'iconText' | 'iconTone' | 'typeId'
>;

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

function rendersIcon(r: StoredRecent): boolean {
  return r.kind !== BLUEPRINT_KIND || (r.typeId !== undefined && recentImage(r) !== undefined);
}

function readRecents(raw?: string | null): SearchResult[] {
  return readStored(raw)
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
  emitRecents();
}

export function subscribeRecents(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function getRecentsSnapshot(): SearchResult[] {
  const raw = safeStorage()?.getItem(STORAGE_KEY) ?? null;
  if (raw === cachedRaw) {
    return cachedSnapshot;
  }
  cachedRaw = raw;
  const next = readRecents(raw);
  cachedSnapshot = next.length === 0 ? EMPTY_RECENTS : next;
  return cachedSnapshot;
}

export function getRecentsServerSnapshot(): SearchResult[] {
  return EMPTY_RECENTS;
}

function emitRecents(): void {
  for (const listener of listeners) {
    listener();
  }
}

function readStored(raw?: string | null): StoredRecent[] {
  const value = raw !== undefined ? raw : safeStorage()?.getItem(STORAGE_KEY);
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredRecent).filter(rendersIcon);
  } catch {
    return [];
  }
}

function isStoredRecent(value: unknown): value is StoredRecent {
  return storedRecentSchema.safeParse(value).success;
}
