import { beforeEach, describe, expect, it } from 'vitest';

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
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: ls },
  });
}

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
  atlasDockCharacter,
  PREFERENCE_KEYS,
  pruneRetiredPreferences,
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
  syncPreferenceCookies,
  clearPreferenceCookies,
} = await import('./preferences');

const lsKey = (key: string) => `lgi:pref:${key}`;

beforeEach(() => {
  window.localStorage.clear();
});

describe('peekLocalPreference', () => {
  it('returns undefined when nothing is stored (absence, not the fallback)', () => {
    expect(peekLocalPreference(sitesView)).toBeUndefined();
    expect(peekLocalPreference(atlasDockCharacter)).toBeUndefined();
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

  it('round-trips a nullable character id, including a stored null', () => {
    writeLocalPreference(atlasDockCharacter, 90000001);
    expect(peekLocalPreference(atlasDockCharacter)).toBe(90000001);
    writeLocalPreference(atlasDockCharacter, null);
    expect(peekLocalPreference(atlasDockCharacter)).toBeNull();
  });

  it('keeps preference keys isolated', () => {
    writeLocalPreference(sitesView, 'table');
    expect(peekLocalPreference(atlasDockCharacter)).toBeUndefined();
  });
});

describe('validatePreferenceValue', () => {
  it('accepts a known key with a valid value', () => {
    expect(validatePreferenceValue('sites.view', 'table')).toBe(true);
    expect(validatePreferenceValue('atlas.dockCharacterId', 2114872920)).toBe(true);
    expect(validatePreferenceValue('atlas.dockCharacterId', null)).toBe(true);
  });

  it('rejects a known key with an invalid value', () => {
    expect(validatePreferenceValue('sites.view', 'grid')).toBe(false);
    expect(validatePreferenceValue('atlas.dockCharacterId', -1)).toBe(false);
    expect(validatePreferenceValue('atlas.dockCharacterId', '2114872920')).toBe(false);
  });

  it('rejects an unknown key', () => {
    expect(validatePreferenceValue('sites.theme', 'dark')).toBe(false);
  });

  it('lists registry keys callers read', () => {
    expect(PREFERENCE_KEYS).toContain('sites.view');
    expect(PREFERENCE_KEYS).toContain('industry.profileId');
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
    expect(lastCookieWrite).not.toContain('Secure');
    const raw = lastCookieWrite.split(';')[0]!.split('=')[1];
    expect(readPreferenceCookieValue(raw, sitesView)).toBe('table');
  });

  it('expires every ssrReadable cookie and only those on clear', () => {
    const writes: string[] = [];
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        set cookie(v: string) {
          writes.push(v);
        },
      },
    });
    try {
      clearPreferenceCookies();
      expect(writes).toContain('lgi_pref_sites_view=; Path=/; Max-Age=0; SameSite=Lax');
      expect(writes).toContain('lgi_pref_strip_jobs_dimmed=; Path=/; Max-Age=0; SameSite=Lax');
      expect(writes.some((w) => w.startsWith(`${cookieNameFor(atlasDockCharacter)}=`))).toBe(false);
    } finally {
      installDocumentShim();
    }
  });

  it('does not write a cookie for a non-ssrReadable key', () => {
    lastCookieWrite = '';
    writePreferenceCookie(atlasDockCharacter, 90000001);
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

describe('strip dimmed-set defs', () => {
  it('registers one ssr-readable def per strip surface with the [] lit-by-default fallback', () => {
    for (const id of STRIP_SURFACE_IDS) {
      const def = stripDimmedDef(id);
      expect(def.key).toBe(`strip.${id}.dimmed`);
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

describe('retired preference keys', () => {
  it('prunes retired rows and leaves keys that are still registered', () => {
    window.localStorage.setItem(lsKey('atlas.autoLayout'), JSON.stringify(false));
    window.localStorage.setItem(lsKey('strip.skills.dimmed'), JSON.stringify([1]));
    window.localStorage.setItem(lsKey('planner.buildLocation'), JSON.stringify(null));
    window.localStorage.setItem(lsKey('planner.buildCharacterId'), JSON.stringify(90000001));
    window.localStorage.setItem(lsKey('sites.view'), JSON.stringify('table'));
    pruneRetiredPreferences();
    expect(window.localStorage.getItem(lsKey('atlas.autoLayout'))).toBeNull();
    expect(window.localStorage.getItem(lsKey('strip.skills.dimmed'))).toBeNull();
    expect(window.localStorage.getItem(lsKey('planner.buildLocation'))).toBeNull();
    expect(window.localStorage.getItem(lsKey('planner.buildCharacterId'))).toBeNull();
    expect(window.localStorage.getItem(lsKey('sites.view'))).toBe(JSON.stringify('table'));
    pruneRetiredPreferences();
  });
});

describe('syncPreferenceCookies', () => {
  it('writes resolved values to the SSR cookie and leaves localStorage alone', () => {
    lastCookieWrite = '';
    window.localStorage.setItem(lsKey(sitesView.key), JSON.stringify('cards'));
    syncPreferenceCookies(new Map([[sitesView.key, 'table']]));
    expect(lastCookieWrite).toContain('lgi_pref_sites_view=%22table%22');
    expect(peekLocalPreference(sitesView)).toBe('cards');
  });

  it('leaves unresolved keys alone', () => {
    lastCookieWrite = '';
    syncPreferenceCookies(new Map());
    expect(lastCookieWrite).toBe('');
  });
});
