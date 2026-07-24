import { beforeEach, describe, expect, it } from 'vitest';
import { PREFERENCE_KEYS, STRIP_SURFACE_IDS, stripDimmedKey } from '@/lib/preferences';
import {
  __resetPageSettings,
  listPageSettings,
  registerPageSettings,
  resolvePageSettings,
} from '@/platform/page-settings';
import { FEATURE_CONTROL_IDS } from '@/platform/page-settings/feature-controls';
import { PAGE_SETTINGS_SPECS } from '@/composition/page-settings/register-all';

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
  it('every spec has a non-empty route and references only real preference keys or feature-control ids (anti-drift)', () => {
    expect(PAGE_SETTINGS_SPECS.length).toBeGreaterThan(0);
    for (const spec of PAGE_SETTINGS_SPECS) {
      expect(spec.route.length).toBeGreaterThan(0);
      for (const control of spec.controls ?? []) {
        if (control.kind === 'feature') {
          expect(FEATURE_CONTROL_IDS).toContain(control.id);
        } else {
          expect(PREFERENCE_KEYS).toContain(control.key);
        }
      }
    }
  });

  it('registers at most one spec per route (the engine keeps the first; a duplicate would be silently dead)', () => {
    const routes = PAGE_SETTINGS_SPECS.map((spec) => spec.route);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it('resolves /sites and its sub-routes once registered, empty elsewhere', () => {
    for (const spec of PAGE_SETTINGS_SPECS) registerPageSettings(spec);

    const sites = resolvePageSettings('/sites');
    expect(sites?.route).toBe('/sites');
    expect(resolvePageSettings('/sites/30002')).toBe(sites);
    expect(resolvePageSettings('/characters')).toBeNull();
  });

  it('resolves the account settings page to its junction-owned spec', () => {
    for (const spec of PAGE_SETTINGS_SPECS) registerPageSettings(spec);

    expect(resolvePageSettings('/settings')?.route).toBe('/settings');
  });

  it('declares strips only for registered dimmed-set surfaces, each surface exactly once (anti-drift)', () => {
    const declared = PAGE_SETTINGS_SPECS.flatMap((spec) =>
      spec.strip !== undefined ? [spec.strip.surfaceId] : [],
    );
    // Bidirectional: every declared strip persists to a registered preference
    // key, and every registered strip surface is declared by exactly one spec —
    // a def with no declaring spec is dead config, a duplicate is a drift bug.
    for (const surfaceId of declared) {
      expect(PREFERENCE_KEYS).toContain(stripDimmedKey(surfaceId));
    }
    expect([...declared].sort()).toEqual([...STRIP_SURFACE_IDS].sort());
  });

  it('resolves the tracker surfaces to their strip-declaring specs; /sites declares none (D-7)', () => {
    for (const spec of PAGE_SETTINGS_SPECS) registerPageSettings(spec);

    expect(resolvePageSettings('/skills')?.strip?.surfaceId).toBe('skills');
    expect(resolvePageSettings('/jobs')?.strip?.surfaceId).toBe('jobs');
    expect(resolvePageSettings('/sites')?.strip).toBeUndefined();
  });
});
