import { beforeEach, describe, expect, it, test } from 'vitest';

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
  reconcilePreferences,
  clearRetiredPreferenceCookies,
} = await import('./preferences');

const lsKey = (key: string) => `lgi:pref:${key}`;

beforeEach(() => {
  window.localStorage.clear();
});

test('peekLocalPreference round-trips written values and reads nothing stored, malformed, or invalid as absent', () => {
  // Absence, not the fallback.
  expect(peekLocalPreference(sitesView)).toBeUndefined();
  expect(peekLocalPreference(atlasDockCharacter)).toBeUndefined();

  writeLocalPreference(sitesView, 'table');
  expect(peekLocalPreference(sitesView)).toBe('table');
  // Keys stay isolated.
  expect(peekLocalPreference(atlasDockCharacter)).toBeUndefined();

  writeLocalPreference(atlasDockCharacter, 90000001);
  expect(peekLocalPreference(atlasDockCharacter)).toBe(90000001);
  writeLocalPreference(atlasDockCharacter, null);
  expect(peekLocalPreference(atlasDockCharacter)).toBeNull();

  window.localStorage.setItem(lsKey(sitesView.key), 'not-json{{');
  expect(peekLocalPreference(sitesView)).toBeUndefined();
  window.localStorage.setItem(lsKey(sitesView.key), JSON.stringify('list'));
  expect(peekLocalPreference(sitesView)).toBeUndefined();
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

  it('keeps favorite blueprints as a bounded list of named blueprints', () => {
    const favorite = (typeId: number) => ({ typeId, name: 'Damage Control II' });
    expect(validatePreferenceValue('industry.favoriteBlueprints', [favorite(2049)])).toBe(true);
    expect(validatePreferenceValue('industry.favoriteBlueprints', Array.from({ length: 24 }, (_, i) => favorite(i + 1)))).toBe(true);
    expect(validatePreferenceValue('industry.favoriteBlueprints', Array.from({ length: 25 }, (_, i) => favorite(i + 1)))).toBe(false);
    expect(validatePreferenceValue('industry.favoriteBlueprints', [{ typeId: 2049, name: '' }])).toBe(false);
    expect(validatePreferenceValue('industry.favoriteBlueprints', [2049])).toBe(false);
  });

  it('rejects an unknown key', () => {
    expect(validatePreferenceValue('sites.theme', 'dark')).toBe(false);
  });
});

describe('retired preference cookies', () => {
  it('expires the cookies preferences were once mirrored into', () => {
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
      clearRetiredPreferenceCookies();
      expect(writes).toEqual([
        'lgi_pref_sites_view=; Path=/; Max-Age=0; SameSite=Lax',
        'lgi_pref_strip_jobs_dimmed=; Path=/; Max-Age=0; SameSite=Lax',
      ]);
    } finally {
      installDocumentShim();
    }
  });
});

test('reconcilePreferences prefers the server value and seeds the server from local only where it has none', () => {
  const serverWins = reconcilePreferences(new Map([['sites.view', 'table']]), new Map([['sites.view', 'cards']]));
  expect(serverWins.values.get('sites.view')).toBe('table');
  expect(serverWins.toSeed).toEqual([]);

  const seeded = reconcilePreferences(new Map(), new Map([['sites.view', 'table']]));
  expect(seeded.values.get('sites.view')).toBe('table');
  expect(seeded.toSeed).toEqual(['sites.view']);

  const neither = reconcilePreferences(new Map(), new Map());
  expect(neither.values.has('sites.view')).toBe(false);
  expect(neither.toSeed).toEqual([]);
});

describe('strip dimmed-set defs', () => {
  it('registers one def per strip surface with the [] lit-by-default fallback', () => {
    for (const id of STRIP_SURFACE_IDS) {
      const def = stripDimmedDef(id);
      expect(def.key).toBe(`strip.${id}.dimmed`);
      expect(PREFERENCE_KEYS).toContain(def.key);
      expect(def.fallback).toEqual([]);
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

