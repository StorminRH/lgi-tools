import { beforeEach, describe, expect, it } from 'vitest';

// vitest runs in node by default — shim a minimal in-memory localStorage so the
// codec (guarded on `typeof window`) operates. Same shape as
// search-recents/storage.test.ts; a dynamic import after the shim guarantees the
// module never loads against a missing window.
function installLocalStorageShim() {
  const store = new Map<string, string>();
  const ls: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (k) => (store.has(k) ? store.get(k)! : null),
    key: (i) => Array.from(store.keys())[i] ?? null,
    removeItem: (k) => {
      store.delete(k);
    },
    setItem: (k, v) => {
      store.set(k, String(v));
    },
  };
  // @ts-expect-error — installing a partial window into globalThis for tests
  globalThis.window = { localStorage: ls };
}

installLocalStorageShim();

const {
  sitesView,
  plannerBuildLocation,
  PREFERENCE_KEYS,
  validatePreferenceValue,
  peekLocalPreference,
  writeLocalPreference,
  cookieNameFor,
  readPreferenceCookieValue,
  reconcilePreferences,
  __TEST_ONLY__,
} = await import('./preferences');

const lsKey = (key: string) => __TEST_ONLY__.LS_PREFIX + key;

beforeEach(() => {
  window.localStorage.clear();
});

describe('peekLocalPreference', () => {
  it('returns undefined when nothing is stored (absence, not the fallback)', () => {
    expect(peekLocalPreference(sitesView)).toBeUndefined();
    expect(peekLocalPreference(plannerBuildLocation)).toBeUndefined();
  });

  it('round-trips a written value', () => {
    writeLocalPreference(sitesView, 'table');
    expect(peekLocalPreference(sitesView)).toBe('table');
  });

  it('returns undefined on malformed JSON', () => {
    window.localStorage.setItem(lsKey(sitesView.key), 'not-json{{');
    expect(peekLocalPreference(sitesView)).toBeUndefined();
  });

  it('returns undefined when the stored value fails the schema', () => {
    window.localStorage.setItem(lsKey(sitesView.key), JSON.stringify('list'));
    expect(peekLocalPreference(sitesView)).toBeUndefined();
  });

  it('round-trips the nullable build-location identifier, including a stored null', () => {
    const loc = { systemId: 30000142, systemName: 'Jita', security: 0.9 };
    writeLocalPreference(plannerBuildLocation, loc);
    expect(peekLocalPreference(plannerBuildLocation)).toEqual(loc);
    writeLocalPreference(plannerBuildLocation, null);
    expect(peekLocalPreference(plannerBuildLocation)).toBeNull(); // present-and-null ≠ absent
  });

  it('keeps preference keys isolated', () => {
    writeLocalPreference(sitesView, 'table');
    expect(peekLocalPreference(plannerBuildLocation)).toBeUndefined();
  });
});

describe('validatePreferenceValue', () => {
  it('accepts a known key with a valid value', () => {
    expect(validatePreferenceValue('sites.view', 'table')).toBe(true);
    expect(
      validatePreferenceValue('planner.buildLocation', {
        systemId: 1,
        systemName: 'X',
        security: null,
      }),
    ).toBe(true);
    expect(validatePreferenceValue('planner.buildLocation', null)).toBe(true);
  });

  it('rejects a known key with an invalid value', () => {
    expect(validatePreferenceValue('sites.view', 'grid')).toBe(false);
    expect(validatePreferenceValue('planner.buildLocation', { systemId: -1 })).toBe(false);
  });

  it('rejects an unknown key', () => {
    expect(validatePreferenceValue('sites.theme', 'dark')).toBe(false);
  });

  it('lists every registry key', () => {
    expect(PREFERENCE_KEYS).toContain('sites.view');
    expect(PREFERENCE_KEYS).toContain('planner.buildLocation');
  });
});

describe('cookie codec', () => {
  it('derives a cookie-safe name (dots → underscores)', () => {
    expect(cookieNameFor(sitesView)).toBe('lgi_pref_sites_view');
  });

  it('reads a valid (url-encoded) cookie value', () => {
    const raw = encodeURIComponent(JSON.stringify('table'));
    expect(readPreferenceCookieValue(raw, sitesView)).toBe('table');
  });

  it('falls back on a missing cookie', () => {
    expect(readPreferenceCookieValue(undefined, sitesView)).toBe('cards');
  });

  it('falls back on a garbage or schema-mismatched cookie', () => {
    expect(readPreferenceCookieValue('%%not-json', sitesView)).toBe('cards');
    expect(readPreferenceCookieValue(encodeURIComponent('"list"'), sitesView)).toBe('cards');
  });
});

describe('reconcilePreferences', () => {
  it('prefers the server value and does not seed it', () => {
    const { values, toSeed } = reconcilePreferences(
      new Map([['sites.view', 'table']]),
      new Map([['sites.view', 'cards']]),
    );
    expect(values.get('sites.view')).toBe('table');
    expect(toSeed).toEqual([]);
  });

  it('seeds the server from local only where the server has no value', () => {
    const { values, toSeed } = reconcilePreferences(
      new Map(),
      new Map([['sites.view', 'table']]),
    );
    expect(values.get('sites.view')).toBe('table');
    expect(toSeed).toEqual(['sites.view']);
  });

  it('omits a key absent from both tiers', () => {
    const { values, toSeed } = reconcilePreferences(new Map(), new Map());
    expect(values.has('sites.view')).toBe(false);
    expect(toSeed).toEqual([]);
  });
});
