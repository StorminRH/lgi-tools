import { beforeEach, describe, expect, it } from 'vitest';
import type { SearchResult } from '@/search';

// vitest runs in node by default — shim a minimal in-memory localStorage so
// the storage helpers (which guard on `typeof window`) operate. Imports of
// the module-under-test happen AFTER the shim is installed because the
// helpers themselves read `window` lazily on each call, but using a dynamic
// import is the safest way to guarantee module-load-time isn't earlier.
function installLocalStorageShim() {
  const store = new Map<string, string>();
  const ls: Storage = {
    get length() { return store.size; },
    clear: () => store.clear(),
    getItem: (k) => (store.has(k) ? store.get(k)! : null),
    key: (i) => Array.from(store.keys())[i] ?? null,
    removeItem: (k) => { store.delete(k); },
    setItem: (k, v) => { store.set(k, String(v)); },
  };
  // @ts-expect-error — installing a partial window into globalThis for tests
  globalThis.window = { localStorage: ls };
}

installLocalStorageShim();

const { clearRecents, pushRecent, readRecents, __TEST_ONLY__ } = await import('./storage');

function row(id: string, label = id): SearchResult {
  return {
    kind: 'site',
    id,
    label,
    href: `/sites/${id}`,
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('search-recents storage', () => {
  it('returns an empty list when nothing has been stored', () => {
    expect(readRecents()).toEqual([]);
  });

  it('persists a pushed entry and reads it back with kind=recent', () => {
    pushRecent(row('1', 'one'));
    const out = readRecents();
    expect(out).toHaveLength(1);
    expect(out[0]!.label).toBe('one');
    expect(out[0]!.kind).toBe('recent');
    expect(out[0]!.originKind).toBe('site');
  });

  it('preserves a typeId so a recent EVE-type row keeps its icon', () => {
    pushRecent({
      kind: 'blueprint',
      id: 'blueprint:691',
      label: 'Rifter',
      sub: 'Blueprint',
      href: '/industry/691',
      typeId: 587,
      iconText: 'BP',
      iconTone: 'tool',
    });
    const out = readRecents();
    expect(out).toHaveLength(1);
    expect(out[0]!.typeId).toBe(587);
    expect(out[0]!.originKind).toBe('blueprint');
  });

  it('drops stale item recents that predate the typeId (so they never render "BP")', () => {
    window.localStorage.setItem(
      __TEST_ONLY__.STORAGE_KEY,
      JSON.stringify([
        { kind: 'blueprint', id: 'blueprint:1', label: 'old', href: '/industry/1', iconText: 'BP' },
      ]),
    );
    expect(readRecents()).toEqual([]);
  });

  it('keeps non-item recents without a typeId (sites/tools render their own glyph)', () => {
    window.localStorage.setItem(
      __TEST_ONLY__.STORAGE_KEY,
      JSON.stringify([
        { kind: 'site', id: 's1', label: 'A Site', href: '/sites/1', iconText: 'C3', iconTone: 'cls-c3' },
      ]),
    );
    const out = readRecents();
    expect(out).toHaveLength(1);
    expect(out[0]!.label).toBe('A Site');
  });

  it('floats the most recently pushed entry to the top', () => {
    pushRecent(row('1', 'one'));
    pushRecent(row('2', 'two'));
    pushRecent(row('3', 'three'));
    const labels = readRecents().map((r) => r.label);
    expect(labels).toEqual(['three', 'two', 'one']);
  });

  it('dedupes by id — re-pushing an existing id moves it to the top', () => {
    pushRecent(row('1', 'one'));
    pushRecent(row('2', 'two'));
    pushRecent(row('1', 'one')); // re-push
    const labels = readRecents().map((r) => r.label);
    expect(labels).toEqual(['one', 'two']);
  });

  it('caps the stored list at the configured max', () => {
    const max = __TEST_ONLY__.MAX_RECENTS;
    for (let i = 0; i < max + 5; i++) {
      pushRecent(row(`id-${i}`, `label-${i}`));
    }
    expect(readRecents()).toHaveLength(max);
  });

  it('clearRecents wipes the stored list', () => {
    pushRecent(row('1'));
    pushRecent(row('2'));
    clearRecents();
    expect(readRecents()).toEqual([]);
  });

  it('refuses to push recent-kind rows (avoids self-referential loops)', () => {
    pushRecent({ kind: 'recent', id: '1', label: 'one', href: '/x' });
    expect(readRecents()).toEqual([]);
  });

  it('refuses to push disabled rows (SOON tools)', () => {
    pushRecent({
      kind: 'tool',
      id: 'soon',
      label: 'Soon',
      href: '#',
      disabled: true,
    });
    expect(readRecents()).toEqual([]);
  });

  it('survives malformed localStorage content', () => {
    window.localStorage.setItem(__TEST_ONLY__.STORAGE_KEY, 'not-json{{');
    expect(readRecents()).toEqual([]);
  });

  it('filters out non-conforming stored entries', () => {
    window.localStorage.setItem(
      __TEST_ONLY__.STORAGE_KEY,
      JSON.stringify([
        { kind: 'site', id: '1', label: 'good', href: '/sites/1' },
        { kind: 'site', id: 2, label: 'bad-id-type', href: '/sites/2' },
        null,
        { kind: 'site', label: 'missing-id', href: '/x' },
        { kind: 'blueprint', id: '3', label: 'bad-typeId', href: '/industry/3', typeId: '587' },
      ]),
    );
    const out = readRecents();
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe('1');
  });
});
