import { describe, expect, it } from 'vitest';
import { matchesClassFilter, matchesFilter, siteClassSet } from './site-filter';
import type { SiteType, WormholeClass } from './types';

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

describe('matchesClassFilter', () => {
  it('matches everything when no class is selected', () => {
    expect(matchesClassFilter(['C5'], [])).toBe(true);
    expect(matchesClassFilter([], [])).toBe(true);
  });

  it('matches when the site class set intersects the selection', () => {
    expect(matchesClassFilter(['C3', 'C4'], ['C4', 'C5'])).toBe(true);
  });

  it('rejects when there is no overlap', () => {
    expect(matchesClassFilter(['C1', 'C2'], ['C5'])).toBe(false);
    expect(matchesClassFilter([], ['C5'])).toBe(false);
  });
});

describe('matchesFilter', () => {
  const combatC5: { type: SiteType; clsSet: WormholeClass[] } = { type: 'combat', clsSet: ['C5'] };
  // A gas signature spanning the whole C1–C6 range (see siteClassSet).
  const gasWide: { type: SiteType; clsSet: WormholeClass[] } = {
    type: 'gas',
    clsSet: ['C1', 'C2', 'C3', 'C4', 'C5', 'C6'],
  };

  it('matches every site when nothing is selected', () => {
    expect(matchesFilter(combatC5, { cls: [], types: [] })).toBe(true);
  });

  it('requires BOTH axes when both are selected (intersection)', () => {
    expect(matchesFilter(combatC5, { cls: ['C5'], types: ['combat'] })).toBe(true);
    // class matches but type does not
    expect(matchesFilter(combatC5, { cls: ['C5'], types: ['ore'] })).toBe(false);
    // type matches but class does not
    expect(matchesFilter(combatC5, { cls: ['C1'], types: ['combat'] })).toBe(false);
  });

  it('shows a wide gas signature whenever any class in its range is picked', () => {
    expect(matchesFilter(gasWide, { cls: ['C5'], types: [] })).toBe(true);
    expect(matchesFilter(gasWide, { cls: ['C1'], types: ['gas'] })).toBe(true);
  });

  it('treats a null type as matching only when no type is selected', () => {
    // The table reads rowType from a DOM attribute that can be absent.
    expect(matchesFilter({ type: null, clsSet: ['C5'] }, { cls: ['C5'], types: [] })).toBe(true);
    expect(matchesFilter({ type: null, clsSet: ['C5'] }, { cls: [], types: ['combat'] })).toBe(
      false,
    );
  });
});
