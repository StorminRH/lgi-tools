import type { z } from 'zod';
import type { ClientStore } from '@/lib/client-store';

export type StorageKind = 'local' | 'session';

/**
 * This tab's localStorage or sessionStorage, or null during a server render
 * and wherever the browser refuses it: reading the property itself throws a
 * SecurityError for an opaque origin or when the user blocks site data. It is
 * read on every call, never cached.
 */
export function safeStorage(kind: StorageKind = 'local'): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function readItem(key: string, kind: StorageKind): string | null {
  try {
    return safeStorage(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** The JSON value stored under `key` when it parses and matches `schema`; undefined otherwise. */
export function readStoredJson<T>(key: string, schema: z.ZodType<T>, kind: StorageKind = 'local'): T | undefined {
  const raw = readItem(key, kind);
  if (raw === null) return undefined;
  try {
    return schema.safeParse(JSON.parse(raw)).data;
  } catch {
    return undefined;
  }
}

/**
 * Stores `value` as JSON under `key`. False when there is no storage or the
 * browser refuses the write: a full quota, or storage disabled for the site
 * (private browsing can hand out a zero-quota store that reads fine).
 */
export function writeStoredJson(key: string, value: unknown, kind: StorageKind = 'local'): boolean {
  const storage = safeStorage(kind);
  if (storage === null) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function parseEntries<S>(raw: string | null, item: z.ZodType<S>): S[] {
  if (raw === null) return [];
  let stored: unknown;
  try {
    stored = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(stored)) return [];
  return stored.flatMap((entry: unknown) => {
    const parsed = item.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

/**
 * A device-local most-recent-first list in localStorage, read with
 * useClientStore. Each stored entry is checked against `item` (unknown keys
 * stripped, bad rows skipped) and `keep`, then capped at `max`. `get` reads
 * storage on every call and returns the same projected value until the stored
 * string changes. `push` moves an entry to the head, dropping its `sameEntry`
 * twin and anything past `max`, and notifies only when the write lands.
 */
export function createStoredList<S, V>({
  key,
  max,
  item,
  sameEntry,
  keep,
  project,
  serverValue,
}: {
  readonly key: string;
  readonly max: number;
  readonly item: z.ZodType<S>;
  readonly sameEntry: (a: S, b: S) => boolean;
  readonly keep?: (entry: S) => boolean;
  readonly project: (entries: S[]) => V;
  readonly serverValue: V;
}): Pick<ClientStore<V>, 'get' | 'subscribe' | 'serverValue'> & { readonly push: (entry: S) => void } {
  const listeners = new Set<() => void>();
  let cachedRaw: string | null | undefined;
  let entries: S[] = [];
  let value = serverValue;

  function read(): S[] {
    const raw = readItem(key, 'local');
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      const stored = parseEntries(raw, item);
      entries = (keep ? stored.filter(keep) : stored).slice(0, max);
      value = project(entries);
    }
    return entries;
  }

  return {
    get() {
      read();
      return value;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    serverValue,
    push(entry) {
      const next = [entry, ...read().filter((stored) => !sameEntry(stored, entry))].slice(0, max);
      if (!writeStoredJson(key, next)) return;
      for (const listener of [...listeners]) listener();
    },
  };
}
