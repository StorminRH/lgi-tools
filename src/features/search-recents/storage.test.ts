import { afterEach, expect, test, vi } from 'vitest';
import { blueprintImage, itemImage } from '@/data/eve-data/type-images';
import type { SearchResult } from '@/platform/search';

const h = vi.hoisted(() => ({ hydrated: true, subscribe: null as ((listener: () => void) => () => void) | null }));

vi.mock('react', () => ({
  useSyncExternalStore: (subscribe: (listener: () => void) => () => void, client: () => unknown, server: () => unknown) => {
    h.subscribe = subscribe;
    return h.hydrated ? client() : server();
  },
}));

const { pushRecent, useSearchRecents } = await import('./storage');

const KEY = 'lgi:search:recents';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A fresh, empty device storage behind `window.localStorage`. */
function installStorage() {
  const items = new Map<string, string>();
  const storage = {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => {
      items.set(key, value);
    }),
  };
  vi.stubGlobal('window', { localStorage: storage });
  return storage;
}

function row(id: string, label = id): SearchResult {
  return { kind: 'site', id, label, href: `/sites/${id}` };
}

test('a picked result reads back as a recent row, newest first, moved up when picked again, and ten are kept', () => {
  installStorage();
  expect(useSearchRecents()).toEqual([]);

  pushRecent(row('1', 'one'));
  expect(useSearchRecents()).toEqual([{ kind: 'recent', originKind: 'site', id: '1', label: 'one', href: '/sites/1' }]);

  pushRecent(row('2', 'two'));
  pushRecent(row('3', 'three'));
  pushRecent(row('1', 'one'));
  expect(useSearchRecents().map((r) => r.label)).toEqual(['one', 'three', 'two']);

  for (let i = 0; i < 15; i++) pushRecent(row(`id-${i}`, `label-${i}`));
  const capped = useSearchRecents();
  expect(capped).toHaveLength(10);
  expect(capped[0]!.label).toBe('label-14');
  expect(capped[9]!.label).toBe('label-5');
});

test('a blueprint recent keeps its product typeId and rebuilds its icon from the stable id, which is never stored', () => {
  const storage = installStorage();
  pushRecent({
    kind: 'blueprint',
    id: 'blueprint:691',
    label: 'Rifter',
    sub: 'Blueprint',
    href: '/industry/691',
    icon: blueprintImage(691),
    typeId: 587,
    iconText: 'BP',
    iconTone: 'tool',
  });
  const [recent] = useSearchRecents();
  expect(recent!.typeId).toBe(587);
  expect(recent!.icon).toEqual(blueprintImage(691));
  expect(recent!.originKind).toBe('blueprint');
  const stored = JSON.parse(storage.items.get(KEY)!) as Record<string, unknown>[];
  expect(stored[0]!.icon).toBeUndefined();
});

test('stored rows that cannot render or do not match are dropped, and keys a row no longer stores do not leak through', () => {
  const storage = installStorage();
  storage.items.set(
    KEY,
    JSON.stringify([
      // Predates the typeId, so it would render "BP".
      { kind: 'blueprint', id: 'blueprint:1', label: 'old', href: '/industry/1', iconText: 'BP' },
      // Its stable id cannot rebuild a blueprint image.
      { kind: 'blueprint', id: 'blueprint:not-an-id', label: 'bad', href: '/industry/691', typeId: 587 },
      { kind: 'site', id: 2, label: 'bad-id-type', href: '/sites/2' },
      null,
      { kind: 'site', label: 'missing-id', href: '/x' },
      { kind: 'blueprint', id: '3', label: 'bad-typeId', href: '/industry/3', typeId: '587' },
      // Sites and tools render their own glyph without a typeId; an icon stored by an old build is not theirs.
      { kind: 'site', id: 's1', label: 'A Site', href: '/sites/1', iconText: 'C3', iconTone: 'cls-c3', icon: itemImage(34) },
    ]),
  );
  expect(useSearchRecents()).toEqual([
    { kind: 'recent', originKind: 'site', id: 's1', label: 'A Site', href: '/sites/1', iconText: 'C3', iconTone: 'cls-c3' },
  ]);

  storage.items.set(KEY, 'not-json{{');
  expect(useSearchRecents()).toEqual([]);
});

test('recent and disabled rows are refused without a write or a notification', () => {
  const storage = installStorage();
  useSearchRecents();
  const listener = vi.fn();
  const unsubscribe = h.subscribe!(listener);
  pushRecent({ kind: 'recent', id: '1', label: 'one', href: '/x' });
  pushRecent({ kind: 'tool', id: 'soon', label: 'Soon', href: '#', disabled: true });
  unsubscribe();
  expect(listener).not.toHaveBeenCalled();
  expect(storage.setItem).not.toHaveBeenCalled();
  expect(useSearchRecents()).toEqual([]);
});

test('an unchanged stored list reads as the same array, and empty storage reads as the server value', () => {
  const storage = installStorage();
  h.hydrated = false;
  const server = useSearchRecents();
  expect(server).toEqual([]);
  h.hydrated = true;
  expect(useSearchRecents()).toBe(server);

  pushRecent(row('1', 'one'));
  const first = useSearchRecents();
  expect(useSearchRecents()).toBe(first);
  h.hydrated = false;
  expect(useSearchRecents()).toBe(server);
  h.hydrated = true;

  pushRecent(row('2', 'two'));
  const second = useSearchRecents();
  expect(second).not.toBe(first);
  expect(second.map((r) => r.label)).toEqual(['two', 'one']);

  // Another writer changed the stored list without telling this store.
  storage.items.set(KEY, JSON.stringify([{ kind: 'site', id: 's1', label: 'A Site', href: '/sites/1' }]));
  expect(useSearchRecents().map((r) => r.label)).toEqual(['A Site']);

  storage.items.delete(KEY);
  expect(useSearchRecents()).toBe(server);
});

test('a picked result notifies whoever is listening, until they stop', () => {
  installStorage();
  useSearchRecents();
  const seen: number[] = [];
  const unsubscribe = h.subscribe!(() => {
    seen.push(useSearchRecents().length);
  });
  pushRecent(row('1', 'one'));
  pushRecent(row('2', 'two'));
  unsubscribe();
  pushRecent(row('3', 'three'));
  expect(seen).toEqual([1, 2]);
});

test('a device that refuses the write still lets the pick through, without a notification', () => {
  const storage = installStorage();
  pushRecent(row('1', 'one'));
  useSearchRecents();
  const listener = vi.fn();
  const unsubscribe = h.subscribe!(listener);
  storage.setItem.mockImplementation(() => {
    throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
  });
  expect(() => pushRecent(row('2', 'two'))).not.toThrow();
  unsubscribe();
  expect(listener).not.toHaveBeenCalled();
  expect(useSearchRecents().map((r) => r.label)).toEqual(['one']);

  vi.stubGlobal('window', {
    get localStorage(): Storage {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    },
  });
  expect(() => pushRecent(row('3', 'three'))).not.toThrow();
  expect(useSearchRecents()).toEqual([]);
});
