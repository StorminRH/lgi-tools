import { expect, test } from 'vitest';
import { siteResource } from './__tests__/site-fixtures';
import { liveRecipesForSearch } from './live-recipes-for-search';
import type { SiteResource } from './types';

const gas = (over: Partial<SiteResource>): SiteResource =>
  siteResource({
    resourceKind: 'gas',
    typeId: 30370,
    units: 1_000,
    totalIsk: 20_000_000,
    liveIsk: 28_100_000,
    liveEligible: true,
    ...over,
  });

test('liveRecipesForSearch keeps only live-eligible resources with type id and units', () => {
  expect(liveRecipesForSearch([])).toEqual([]);
  expect(liveRecipesForSearch([gas({ liveEligible: false })])).toEqual([]);

  expect(
    liveRecipesForSearch([
      gas({ id: 1 }),
      gas({ id: 2, liveEligible: false, typeId: 1 }),
      gas({ id: 3, typeId: null }),
      gas({ id: 4, units: null }),
      gas({ id: 5, units: 0 }),
      gas({
        id: 6,
        typeId: 30371,
        units: 500,
        effectiveIsk: 5_000_000,
      }),
    ]),
  ).toEqual([
    { typeId: 30370, units: 1_000, seedIsk: 28_100_000 },
    { typeId: 30371, units: 500, seedIsk: 5_000_000 },
  ]);
});
