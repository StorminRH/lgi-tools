import { beforeEach, describe, expect, it } from 'vitest';
import { blueprintImage } from '@/data/eve-data/type-images';
import type { SearchResult } from '@/platform/search';

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
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: ls },
  });
}

installLocalStorageShim();

const {
  getRecentsServerSnapshot,
  getRecentsSnapshot,
  pushRecent,
  subscribeRecents,
} = await import('./storage');
const { useSearchRecents } = await import('./use-search-recents');
const STORAGE_KEY = 'lgi:search:recents';
const MAX_RECENTS = 10;

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
    expect(getRecentsSnapshot()).toEqual([]);
  });

  it('persists a pushed entry and reads it back with kind=recent', () => {
    pushRecent(row('1', 'one'));
    const out = getRecentsSnapshot();
    expect(out).toHaveLength(1);
    expect(out[0]!.label).toBe('one');
    expect(out[0]!.kind).toBe('recent');
    expect(out[0]!.originKind).toBe('site');
  });

  it('preserves product typeId but reconstructs a blueprint recent image from its stable id', () => {
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
    const out = getRecentsSnapshot();
    expect(out).toHaveLength(1);
    expect(out[0]!.typeId).toBe(587);
    expect(out[0]!.icon).toEqual(blueprintImage(691));
    expect(out[0]!.originKind).toBe('blueprint');
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!);
    expect(stored[0].icon).toBeUndefined();
  });

  it('drops stale item recents that predate the typeId (so they never render "BP")', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { kind: 'blueprint', id: 'blueprint:1', label: 'old', href: '/industry/1', iconText: 'BP' },
      ]),
    );
    expect(getRecentsSnapshot()).toEqual([]);
  });

  it('drops a blueprint recent whose stable id cannot reconstruct a blueprint image', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          kind: 'blueprint',
          id: 'blueprint:not-an-id',
          label: 'bad',
          href: '/industry/691',
          typeId: 587,
        },
      ]),
    );
    expect(getRecentsSnapshot()).toEqual([]);
  });

  it('keeps non-item recents without a typeId (sites/tools render their own glyph)', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { kind: 'site', id: 's1', label: 'A Site', href: '/sites/1', iconText: 'C3', iconTone: 'cls-c3' },
      ]),
    );
    const out = getRecentsSnapshot();
    expect(out).toHaveLength(1);
    expect(out[0]!.label).toBe('A Site');
  });

  it('floats the most recently pushed entry to the top', () => {
    pushRecent(row('1', 'one'));
    pushRecent(row('2', 'two'));
    pushRecent(row('3', 'three'));
    const labels = getRecentsSnapshot().map((r) => r.label);
    expect(labels).toEqual(['three', 'two', 'one']);
  });

  it('dedupes by id — re-pushing an existing id moves it to the top', () => {
    pushRecent(row('1', 'one'));
    pushRecent(row('2', 'two'));
    pushRecent(row('1', 'one'));
    const labels = getRecentsSnapshot().map((r) => r.label);
    expect(labels).toEqual(['one', 'two']);
  });

  it('caps the stored list at the configured max', () => {
    const max = MAX_RECENTS;
    for (let i = 0; i < max + 5; i++) {
      pushRecent(row(`id-${i}`, `label-${i}`));
    }
    expect(getRecentsSnapshot()).toHaveLength(max);
  });

  it('clearing the recents key wipes the stored list', () => {
    pushRecent(row('1'));
    pushRecent(row('2'));
    window.localStorage.removeItem(STORAGE_KEY);
    expect(getRecentsSnapshot()).toEqual([]);
  });

  it('refuses to push recent-kind rows (avoids self-referential loops)', () => {
    pushRecent({ kind: 'recent', id: '1', label: 'one', href: '/x' });
    expect(getRecentsSnapshot()).toEqual([]);
  });

  it('refuses to push disabled rows (SOON tools)', () => {
    pushRecent({
      kind: 'tool',
      id: 'soon',
      label: 'Soon',
      href: '#',
      disabled: true,
    });
    expect(getRecentsSnapshot()).toEqual([]);
  });

  it('survives malformed localStorage content', () => {
    window.localStorage.setItem(STORAGE_KEY, 'not-json{{');
    expect(getRecentsSnapshot()).toEqual([]);
  });

  it('filters out non-conforming stored entries', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { kind: 'site', id: '1', label: 'good', href: '/sites/1' },
        { kind: 'site', id: 2, label: 'bad-id-type', href: '/sites/2' },
        null,
        { kind: 'site', label: 'missing-id', href: '/x' },
        { kind: 'blueprint', id: '3', label: 'bad-typeId', href: '/industry/3', typeId: '587' },
      ]),
    );
    const out = getRecentsSnapshot();
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe('1');
  });
});

describe('search-recents store emit and cache', () => {
  it('exposes useSearchRecents as the useSyncExternalStore hook', () => {
    expect(typeof useSearchRecents).toBe('function');
  });

  it('returns the same snapshot reference while storage is unchanged', () => {
    pushRecent(row('1', 'one'));
    const first = getRecentsSnapshot();
    const second = getRecentsSnapshot();
    expect(first).toBe(second);
    expect(first).toHaveLength(1);
    expect(first[0]!.label).toBe('one');
  });

  it('returns a new snapshot after a write that changes the stored list', () => {
    pushRecent(row('1', 'one'));
    const before = getRecentsSnapshot();
    pushRecent(row('2', 'two'));
    const after = getRecentsSnapshot();
    expect(after).not.toBe(before);
    expect(after.map((r) => r.label)).toEqual(['two', 'one']);
  });

  it('notifies subscribers after a successful write', () => {
    const seen: number[] = [];
    const unsubscribe = subscribeRecents(() => {
      seen.push(getRecentsSnapshot().length);
    });
    pushRecent(row('1', 'one'));
    pushRecent(row('2', 'two'));
    unsubscribe();
    expect(seen).toEqual([1, 2]);
  });

  it('stops notifying after unsubscribe', () => {
    let calls = 0;
    const unsubscribe = subscribeRecents(() => {
      calls += 1;
    });
    pushRecent(row('1', 'one'));
    unsubscribe();
    pushRecent(row('2', 'two'));
    expect(calls).toBe(1);
  });

  it('does not emit when a recent-kind or disabled row is refused', () => {
    let calls = 0;
    const unsubscribe = subscribeRecents(() => {
      calls += 1;
    });
    pushRecent({ kind: 'recent', id: '1', label: 'one', href: '/x' });
    pushRecent({
      kind: 'tool',
      id: 'soon',
      label: 'Soon',
      href: '#',
      disabled: true,
    });
    unsubscribe();
    expect(calls).toBe(0);
    expect(getRecentsSnapshot()).toBe(getRecentsServerSnapshot());
  });

  it('keeps the server snapshot identity-stable and empty', () => {
    pushRecent(row('1', 'one'));
    const first = getRecentsServerSnapshot();
    const second = getRecentsServerSnapshot();
    expect(first).toBe(second);
    expect(first).toEqual([]);
  });

  it('reuses the empty server snapshot when storage is empty', () => {
    expect(getRecentsSnapshot()).toBe(getRecentsServerSnapshot());
    pushRecent(row('1', 'one'));
    window.localStorage.removeItem(STORAGE_KEY);
    expect(getRecentsSnapshot()).toBe(getRecentsServerSnapshot());
  });

  it('rebuilds the cached snapshot when the stored payload changes without emit', () => {
    pushRecent(row('1', 'one'));
    const before = getRecentsSnapshot();
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ kind: 'site', id: 's1', label: 'A Site', href: '/sites/1' }]),
    );
    const after = getRecentsSnapshot();
    expect(after).not.toBe(before);
    expect(after).toHaveLength(1);
    expect(after[0]!.label).toBe('A Site');
  });
});
