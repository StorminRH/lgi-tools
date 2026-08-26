import { describe, expect, it } from 'vitest';
import {
  parseServerPreferences,
  processPreferencesResponse,
} from './parse-server-preferences';

describe('server preferences', () => {
  it('keeps valid keys, drops invalid ones, and seeds nothing on a failed read', () => {
    expect(parseServerPreferences([{ key: 'sites.view', value: 'table' }]).get('sites.view')).toBe(
      'table',
    );
    expect(parseServerPreferences([{ key: 'not.a.key', value: 'x' }]).size).toBe(0);
    expect(parseServerPreferences([{ key: 'sites.view', value: 'nonsense' }]).size).toBe(0);

    const applied = processPreferencesResponse(
      { ok: true, data: { preferences: [{ key: 'sites.view', value: 'table' }] } },
      new Map(),
    );
    expect(applied.reconciled.get('sites.view')).toBe('table');
    expect(applied.toSeed).toEqual([]);
    expect(processPreferencesResponse({ ok: false }, new Map()).toSeed).toEqual([]);
  });
});
