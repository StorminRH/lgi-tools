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

// Capture the last `document.cookie =` assignment so writePreferenceCookie can be
// asserted without a DOM. `location` defaults to http (no Secure flag); a test
// overrides it to exercise the https branch.
let lastCookieWrite = '';
function installDocumentShim() {
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      get cookie() {
        return lastCookieWrite;
      },
      set cookie(v: string) {
        lastCookieWrite = v;
      },
    },
  });
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { protocol: 'http:' },
  });
}

installLocalStorageShim();
installDocumentShim();

const {
  sitesView,
  plannerBuildLocation,
  PREFERENCE_KEYS,
  STRIP_SURFACE_IDS,
  stripDimmedDef,
  stripDimmedKey,
  validatePreferenceValue,
  peekLocalPreference,
  writeLocalPreference,
  cookieNameFor,
  writePreferenceCookie,
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

  it('writes an ssrReadable key as a Lax, path-/, url-encoded cookie', () => {
    lastCookieWrite = '';
    writePreferenceCookie(sitesView, 'table');
    expect(lastCookieWrite).toContain('lgi_pref_sites_view=%22table%22');
    expect(lastCookieWrite).toContain('Path=/');
    expect(lastCookieWrite).toContain('SameSite=Lax');
    expect(lastCookieWrite).not.toContain('Secure'); // http in the shim
    // round-trips back through the reader
    const raw = lastCookieWrite.split(';')[0].split('=')[1];
    expect(readPreferenceCookieValue(raw, sitesView)).toBe('table');
  });

  it('does not write a cookie for a non-ssrReadable key', () => {
    lastCookieWrite = '';
    writePreferenceCookie(plannerBuildLocation, { systemId: 1, systemName: 'X', security: null });
    expect(lastCookieWrite).toBe('');
  });

  it('marks the cookie Secure on https', () => {
    const loc = globalThis.location as unknown as { protocol: string };
    loc.protocol = 'https:';
    try {
      lastCookieWrite = '';
      writePreferenceCookie(sitesView, 'cards');
      expect(lastCookieWrite).toContain('; Secure');
    } finally {
      loc.protocol = 'http:';
    }
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

// The per-surface strip dimmed sets (ACCOUNT.7): store-off-not-on — the stored
// value is the DIMMED ids, so a key holding [] and an absent key both render
// every character lit, and a newly linked alt defaults lit everywhere.
describe('strip dimmed-set defs', () => {
  it('registers one ssr-readable def per strip surface with the [] lit-by-default fallback', () => {
    for (const id of STRIP_SURFACE_IDS) {
      const def = stripDimmedDef(id);
      expect(def.key).toBe(stripDimmedKey(id));
      expect(PREFERENCE_KEYS).toContain(def.key);
      expect(def.fallback).toEqual([]);
      expect(def.ssrReadable).toBe(true);
    }
  });

  it('returns stable def references (usePreference setter identity)', () => {
    for (const id of STRIP_SURFACE_IDS) {
      expect(stripDimmedDef(id)).toBe(stripDimmedDef(id));
    }
    expect(stripDimmedDef(undefined)).toBe(stripDimmedDef(undefined));
  });

  it('validates the wire value at the server trust boundary', () => {
    const key = stripDimmedKey(STRIP_SURFACE_IDS[0]);
    expect(validatePreferenceValue(key, [2114872920, 90000001])).toBe(true);
    expect(validatePreferenceValue(key, [])).toBe(true);
    expect(validatePreferenceValue(key, ['2114872920'])).toBe(false);
    expect(validatePreferenceValue(key, [1.5])).toBe(false);
    expect(validatePreferenceValue(key, [-1])).toBe(false);
    expect(validatePreferenceValue(key, null)).toBe(false);
  });

  it('keeps the no-strip sentinel unregistered and unwritable', () => {
    const sentinel = stripDimmedDef(undefined);
    expect(PREFERENCE_KEYS).not.toContain(sentinel.key);
    expect(validatePreferenceValue(sentinel.key, [])).toBe(false);
  });
});
