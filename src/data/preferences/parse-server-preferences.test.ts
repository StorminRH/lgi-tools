import { describe, expect, it } from 'vitest';
import {
  parseServerPreferences,
  processPreferencesResponse,
} from './parse-server-preferences';

describe('parseServerPreferences', () => {
  it('keeps a known key whose value re-validates', () => {
    const values = parseServerPreferences([{ key: 'sites.view', value: 'table' }]);
    expect(values.get('sites.view')).toBe('table');
  });

  it('drops an unknown key and a known key with an invalid value', () => {
    expect(parseServerPreferences([{ key: 'not.a.key', value: 'x' }]).size).toBe(0);
    expect(parseServerPreferences([{ key: 'sites.view', value: 'nonsense' }]).size).toBe(0);
  });
});

describe('processPreferencesResponse', () => {
  it('applies the server value and seeds nothing when local is empty', () => {
    const { reconciled, toSeed } = processPreferencesResponse(
      { ok: true, data: { preferences: [{ key: 'sites.view', value: 'table' }] } },
      new Map(),
    );
    expect(reconciled.get('sites.view')).toBe('table');
    expect(toSeed).toEqual([]);
  });

  it('contributes no server values and seeds nothing on a failed read', () => {
    const { toSeed } = processPreferencesResponse({ ok: false }, new Map());
    expect(toSeed).toEqual([]);
  });
});
