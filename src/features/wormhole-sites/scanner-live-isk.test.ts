import { expect, test } from 'vitest';
import {
  recipeLiveIsk,
  scannerEstIskValue,
  scannerLiveEstIsk,
  scannerLiveTypeIdKey,
  scannerLiveTypeIdsForNames,
  sumKnownIsk,
} from './scanner-live-isk';
import type { SiteLiveRecipe } from './site-name-lookup';

const RECIPE: SiteLiveRecipe = {
  typeId: 30370,
  units: 1_000,
  seedIsk: 28_100_000,
};

test('scanner live Est. ISK sums recipes, tracks pending, and keys unique type ids', () => {
  expect(recipeLiveIsk(RECIPE, 30)).toBe(30_000);
  expect(recipeLiveIsk(RECIPE, null)).toBe(28_100_000);
  expect(recipeLiveIsk(RECIPE, undefined)).toBe(28_100_000);

  expect(
    scannerLiveEstIsk(
      [RECIPE, { typeId: 1, units: 2, seedIsk: 100 }],
      (typeId) => (typeId === 30370 ? { bestSell: 10 } : undefined),
      () => false,
    ),
  ).toEqual({ total: 10_100, pending: false });

  expect(
    scannerLiveEstIsk(
      [RECIPE],
      () => undefined,
      (typeId) => typeId === 30370,
    ),
  ).toEqual({ total: 28_100_000, pending: true });

  expect(scannerLiveEstIsk([], () => undefined, () => false)).toEqual({
    total: null,
    pending: false,
  });
  expect(
    scannerLiveEstIsk(
      [{ typeId: 30370, units: 1_000, seedIsk: null }],
      () => undefined,
      () => false,
    ),
  ).toEqual({ total: null, pending: false });

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
  expect(scannerLiveTypeIdKey([3, 1, 2, 1])).toBe('1,2,3');
  expect(scannerLiveTypeIdKey([])).toBe('');

  const lookups = {
    estIskForName: (name: string) => (name === 'Sansha Hideout' ? 12_000_000 : 28_100_000),
    liveRecipesForName: (name: string) => (name === 'Barren Perimeter Reservoir' ? [RECIPE] : []),
  };
  const livePrices = {
    priceOf: (typeId: number) => (typeId === 30370 ? { bestSell: 25_000 } : undefined),
    isPending: () => false,
  };
  expect(scannerEstIskValue(null, true, lookups, livePrices)).toBeNull();
  expect(scannerEstIskValue('Sansha Hideout', false, lookups, livePrices)).toBe(12_000_000);
  expect(scannerEstIskValue('Sansha Hideout', true, lookups, livePrices)).toBe(12_000_000);
  expect(
    scannerEstIskValue('Barren Perimeter Reservoir', true, lookups, livePrices),
  ).toBe(25_000_000);
  expect(sumKnownIsk([12_000_000, null, 3_000_000])).toBe(15_000_000);
  expect(sumKnownIsk([null, null])).toBeNull();
});
