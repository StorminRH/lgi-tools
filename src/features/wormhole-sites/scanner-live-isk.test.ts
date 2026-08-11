import { describe, expect, it } from 'vitest';
import {
  recipeLiveIsk,
  scannerLiveEstIsk,
  scannerLiveTypeIdKey,
  scannerLiveTypeIdsForNames,
} from './scanner-live-isk';
import type { SiteLiveRecipe } from './site-name-lookup';

const RECIPE: SiteLiveRecipe = {
  typeId: 30370,
  units: 1_000,
  seedIsk: 28_100_000,
};

describe('recipeLiveIsk', () => {
  it('computes units × buy and falls back to the catalogue seed', () => {
    expect(recipeLiveIsk(RECIPE, 30)).toBe(30_000);
    expect(recipeLiveIsk(RECIPE, null)).toBe(28_100_000);
    expect(recipeLiveIsk(RECIPE, undefined)).toBe(28_100_000);
  });
});

describe('scannerLiveEstIsk', () => {
  it('sums recipes and reports pending when any type is in flight', () => {
    const settled = scannerLiveEstIsk(
      [RECIPE, { typeId: 1, units: 2, seedIsk: 100 }],
      (typeId) => (typeId === 30370 ? { pct5Buy: 10 } : undefined),
      () => false,
    );
    expect(settled).toEqual({ total: 10_100, pending: false });

    const pending = scannerLiveEstIsk(
      [RECIPE],
      () => undefined,
      (typeId) => typeId === 30370,
    );
    expect(pending).toEqual({ total: 28_100_000, pending: true });
  });

  it('returns null total for an empty recipe list', () => {
    expect(scannerLiveEstIsk([], () => undefined, () => false)).toEqual({
      total: null,
      pending: false,
    });
  });
});

describe('scannerLiveTypeIdsForNames', () => {
  it('collects unique type ids across named harvestable sites', () => {
    const recipes = new Map<string, readonly SiteLiveRecipe[]>([
      ['A', [RECIPE, { typeId: 1, units: 1, seedIsk: 1 }]],
      ['B', [{ typeId: 1, units: 2, seedIsk: 2 }]],
      ['C', []],
    ]);
    expect(
      scannerLiveTypeIdsForNames(['A', 'B', 'C', 'missing'], (name) =>
        recipes.get(name) ?? [],
      ),
    ).toEqual([30370, 1]);
  });
});

describe('scannerLiveTypeIdKey', () => {
  it('sorts and dedupes so set membership alone drives remount keys', () => {
    expect(scannerLiveTypeIdKey([3, 1, 2, 1])).toBe('1,2,3');
    expect(scannerLiveTypeIdKey([])).toBe('');
  });
});
