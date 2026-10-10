import { afterEach, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { createStoredList, readStoredJson, safeStorage, writeStoredJson } from './web-storage';

afterEach(() => {
  vi.unstubAllGlobals();
});

function memoryStorage(seed: Record<string, string> = {}) {
  const items = new Map(Object.entries(seed));
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => {
      items.set(key, value);
    }),
  };
}

function quotaExceeded(): never {
  throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
}

const blockedWindow = {
  get localStorage(): Storage {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  },
  get sessionStorage(): Storage {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  },
};

test('safeStorage hands back the storage the window has on each call, and null on the server or when the browser refuses it', () => {
  expect(safeStorage()).toBeNull();
  expect(safeStorage('session')).toBeNull();

  const local = memoryStorage();
  const session = memoryStorage();
  vi.stubGlobal('window', { localStorage: local, sessionStorage: session });
  expect(safeStorage()).toBe(local);
  expect(safeStorage('local')).toBe(local);
  expect(safeStorage('session')).toBe(session);

  // Never cached: a different window is read on the next call.
  const replaced = memoryStorage();
  vi.stubGlobal('window', { localStorage: replaced });
  expect(safeStorage()).toBe(replaced);

  vi.stubGlobal('window', blockedWindow);
  expect(safeStorage()).toBeNull();
  expect(safeStorage('session')).toBeNull();
});

test('readStoredJson returns a stored value that parses and matches, and undefined for anything else', () => {
  const schema = z.enum(['cards', 'table']);
  expect(readStoredJson('view', schema)).toBeUndefined();

  const local = memoryStorage({ view: '"table"', bad: 'not-json{{', other: '"grid"' });
  const session = memoryStorage({ view: '"cards"' });
  vi.stubGlobal('window', { localStorage: local, sessionStorage: session });
  expect(readStoredJson('view', schema)).toBe('table');
  expect(readStoredJson('view', schema, 'session')).toBe('cards');
  expect(readStoredJson('missing', schema)).toBeUndefined();
  expect(readStoredJson('bad', schema)).toBeUndefined();
  expect(readStoredJson('other', schema)).toBeUndefined();
  expect(readStoredJson('n', z.number().nullable())).toBeUndefined();
  local.items.set('n', 'null');
  expect(readStoredJson('n', z.number().nullable())).toBeNull();

  vi.stubGlobal('window', {
    localStorage: { getItem: () => quotaExceeded() },
  });
  expect(readStoredJson('view', schema)).toBeUndefined();

  vi.stubGlobal('window', blockedWindow);
  expect(readStoredJson('view', schema)).toBeUndefined();
});

test('writeStoredJson stores JSON and reports false, without throwing, when there is no storage or the write is refused', () => {
  expect(writeStoredJson('view', 'table')).toBe(false);

  const local = memoryStorage();
  const session = memoryStorage();
  vi.stubGlobal('window', { localStorage: local, sessionStorage: session });
  expect(writeStoredJson('view', 'table')).toBe(true);
  expect(local.items.get('view')).toBe('"table"');
  expect(writeStoredJson('ids', [1, 2], 'session')).toBe(true);
  expect(session.items.get('ids')).toBe('[1,2]');
  expect(local.items.has('ids')).toBe(false);

  vi.stubGlobal('window', { localStorage: { ...memoryStorage(), setItem: quotaExceeded } });
  expect(writeStoredJson('view', 'cards')).toBe(false);

  vi.stubGlobal('window', blockedWindow);
  expect(writeStoredJson('view', 'cards')).toBe(false);
});

const entrySchema = z.object({ id: z.number().int().positive(), name: z.string() });
type Entry = z.infer<typeof entrySchema>;
const entry = (id: number, name = `entry ${id}`): Entry => ({ id, name });

function namesList(options: { keep?: (e: Entry) => boolean } = {}) {
  const none: string[] = [];
  return createStoredList({
    key: 'test:list',
    max: 3,
    item: entrySchema,
    sameEntry: (a, b) => a.id === b.id,
    ...options,
    project: (entries) => (entries.length === 0 ? none : entries.map((e) => e.name)),
    serverValue: none,
  });
}

test('a stored list keeps the newest entry first, moves a repeat to the head, and keeps only max entries', () => {
  const local = memoryStorage();
  vi.stubGlobal('window', { localStorage: local });
  const list = namesList();
  expect(list.serverValue).toEqual([]);
  expect(list.get()).toBe(list.serverValue);

  list.push(entry(1));
  list.push(entry(2));
  list.push(entry(1, 'renamed'));
  expect(list.get()).toEqual(['renamed', 'entry 2']);
  list.push(entry(3));
  list.push(entry(4));
  expect(list.get()).toEqual(['entry 4', 'entry 3', 'renamed']);
  expect(JSON.parse(local.items.get('test:list') ?? '')).toEqual([entry(4), entry(3), entry(1, 'renamed')]);
});

test('a stored list reads the same value until the stored string changes, skipping rows that fail the schema or keep', () => {
  const local = memoryStorage();
  vi.stubGlobal('window', { localStorage: local });
  const list = namesList({ keep: (e) => e.id !== 13 });
  list.push(entry(1));
  const first = list.get();
  expect(list.get()).toBe(first);

  local.items.set(
    'test:list',
    JSON.stringify([
      { id: 13, name: 'unlucky' },
      { id: 'x', name: 'bad id' },
      null,
      { id: 2, name: 'kept', legacy: true },
      entry(5),
      entry(6),
      entry(7),
    ]),
  );
  const rebuilt = list.get();
  expect(rebuilt).not.toBe(first);
  expect(rebuilt).toEqual(['kept', 'entry 5', 'entry 6']);

  // Unknown stored keys do not survive the next write.
  list.push(entry(8));
  expect(JSON.parse(local.items.get('test:list') ?? '')).toEqual([entry(8), entry(2, 'kept'), entry(5)]);

  local.items.set('test:list', 'not-json{{');
  expect(list.get()).toBe(list.serverValue);
  local.items.set('test:list', '{"id":1,"name":"not a list"}');
  expect(list.get()).toBe(list.serverValue);
});

test('a stored list notifies listeners only when a write lands, until they unsubscribe', () => {
  const local = memoryStorage();
  vi.stubGlobal('window', { localStorage: local });
  const list = namesList();
  const listener = vi.fn();
  const unsubscribe = list.subscribe(listener);

  list.push(entry(1));
  expect(listener).toHaveBeenCalledTimes(1);

  local.setItem.mockImplementationOnce(quotaExceeded);
  expect(() => list.push(entry(2))).not.toThrow();
  expect(listener).toHaveBeenCalledTimes(1);
  expect(list.get()).toEqual(['entry 1']);

  unsubscribe();
  list.push(entry(3));
  expect(listener).toHaveBeenCalledTimes(1);
  expect(list.get()).toEqual(['entry 3', 'entry 1']);

  const blocked = vi.fn();
  list.subscribe(blocked);
  vi.stubGlobal('window', blockedWindow);
  expect(() => list.push(entry(4))).not.toThrow();
  expect(blocked).not.toHaveBeenCalled();
  expect(list.get()).toBe(list.serverValue);
});
