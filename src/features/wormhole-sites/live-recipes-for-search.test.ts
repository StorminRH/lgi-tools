import { describe, expect, it } from 'vitest';
import { liveRecipesForSearch } from './live-recipes-for-search';
import type { SiteResource } from './types';

function resource(overrides: Partial<SiteResource>): SiteResource {
  return {
    id: 1,
    orderInSite: 0,
    resourceKind: 'gas',
    resourceName: 'Fullerite-C50',
    units: 1_000,
    volumeM3: null,
    iskPerM3: null,
    totalIsk: 20_000_000,
    typeId: 30370,
    liveIsk: 28_100_000,
    effectiveIsk: 28_100_000,
    liveEligible: true,
    ...overrides,
  };
}

describe('liveRecipesForSearch', () => {
  it('keeps only live-eligible resources with positive units and a type id', () => {
    expect(
      liveRecipesForSearch([
        resource({ id: 1 }),
        resource({ id: 2, liveEligible: false, typeId: 1 }),
        resource({ id: 3, typeId: null }),
        resource({ id: 4, units: null }),
        resource({ id: 5, units: 0 }),
        resource({
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

  it('returns an empty list when nothing is live-eligible', () => {
    expect(liveRecipesForSearch([])).toEqual([]);
    expect(
      liveRecipesForSearch([resource({ liveEligible: false })]),
    ).toEqual([]);
  });
});
