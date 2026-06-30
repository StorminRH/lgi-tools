import { beforeEach, describe, expect, it } from 'vitest';
import { PREFERENCE_KEYS } from '@/lib/preferences';
import {
  __resetPageSettings,
  listPageSettings,
  registerPageSettings,
  resolvePageSettings,
} from '@/page-settings';
import { PAGE_SETTINGS_SPECS } from '@/page-settings/register-all';

// Importing register-all (for PAGE_SETTINGS_SPECS) also runs its side-effect
// registration once; reset before each test so the engine cases start clean. The
// anti-drift case asserts on the EXPORTED list, so it is reset-independent.
beforeEach(() => __resetPageSettings());

describe('page-settings engine', () => {
  it('registers, lists, resolves, and resets', () => {
    expect(listPageSettings()).toEqual([]);

    registerPageSettings({ route: '/a' });
    registerPageSettings({ route: '/b', controls: [] });
    expect(listPageSettings().map((s) => s.route)).toEqual(['/a', '/b']);

    expect(resolvePageSettings('/a')).toEqual({ route: '/a' });
    expect(resolvePageSettings('/nope')).toBeNull();

    __resetPageSettings();
    expect(listPageSettings()).toEqual([]);
  });
});

describe('the wired registry (PAGE_SETTINGS_SPECS)', () => {
  it('every spec has a non-empty route and references only real preference keys (anti-drift)', () => {
    expect(PAGE_SETTINGS_SPECS.length).toBeGreaterThan(0);
    for (const spec of PAGE_SETTINGS_SPECS) {
      expect(spec.route.length).toBeGreaterThan(0);
      for (const control of spec.controls ?? []) {
        expect(PREFERENCE_KEYS).toContain(control.key);
      }
    }
  });

  it('resolves /sites and its sub-routes once registered, empty elsewhere', () => {
    for (const spec of PAGE_SETTINGS_SPECS) registerPageSettings(spec);

    const sites = resolvePageSettings('/sites');
    expect(sites?.route).toBe('/sites');
    expect(resolvePageSettings('/sites/30002')).toBe(sites);
    expect(resolvePageSettings('/skills')).toBeNull();
  });
});
