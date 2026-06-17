import { describe, expect, it } from 'vitest';
import { siteClassSet } from './site-filter';

describe('siteClassSet', () => {
  it('returns the single declared class for a classed site', () => {
    expect(siteClassSet({ wormholeClass: 'C3', siteType: 'combat', name: 'Anything' })).toEqual([
      'C3',
    ]);
  });

  it('expands a gas signature to its whole name-derived spawn range', () => {
    // "Perimeter" gas sigs spawn across C1–C6; "Core" only in C5–C6.
    expect(
      siteClassSet({ wormholeClass: null, siteType: 'gas', name: 'Perimeter Reservoir' }),
    ).toEqual(['C1', 'C2', 'C3', 'C4', 'C5', 'C6']);
    expect(siteClassSet({ wormholeClass: null, siteType: 'gas', name: 'Core Garden' })).toEqual([
      'C5',
      'C6',
    ]);
  });

  it('matches no class when a site has neither a class nor a recognized gas range', () => {
    expect(siteClassSet({ wormholeClass: null, siteType: 'gas', name: 'Unmapped Pocket' })).toEqual(
      [],
    );
    expect(siteClassSet({ wormholeClass: null, siteType: 'combat', name: 'Whatever' })).toEqual([]);
  });
});
