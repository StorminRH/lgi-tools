import { describe, expect, it } from 'vitest';
import type { SiteSearchEntry } from './queries';
import { selectRelatedSites } from './related-sites';

function site(
  id: number,
  siteType: SiteSearchEntry['siteType'],
  wormholeClass: SiteSearchEntry['wormholeClass'],
): SiteSearchEntry {
  return {
    id,
    name: `Site ${id}`,
    siteType,
    wormholeClass,
    blueLootIsk: null,
    resourceValueIsk: null,
  };
}

describe('selectRelatedSites', () => {
  const catalogue = [
    site(1, 'combat', 'C1'),
    site(2, 'gas', 'C1'),
    site(3, 'combat', 'C2'),
    site(4, 'combat', 'C1'),
    site(5, 'ore', 'C3'),
    site(6, 'combat', 'C1'),
    site(7, 'relic', 'C1'),
  ];

  it('ranks same type and class before broader matches', () => {
    expect(selectRelatedSites(catalogue, 1).map(({ id }) => id)).toEqual([4, 6, 3]);
  });

  it('is deterministic and excludes the current site', () => {
    const first = selectRelatedSites(catalogue, 4);
    const second = selectRelatedSites(catalogue, 4);
    expect(second).toEqual(first);
    expect(first).toHaveLength(3);
    expect(first.some(({ id }) => id === 4)).toBe(false);
  });

  it('rotates tie-breaking through catalogue order', () => {
    expect(selectRelatedSites(catalogue, 4).map(({ id }) => id)).toEqual([6, 1, 3]);
    expect(selectRelatedSites(catalogue, 6).map(({ id }) => id)).toEqual([1, 4, 3]);
  });

  it('falls back to the available catalogue without duplicating links', () => {
    const small = [site(1, 'gas', null), site(2, 'ore', null), site(3, 'data', null)];
    expect(selectRelatedSites(small, 1).map(({ id }) => id)).toEqual([2, 3]);
    expect(selectRelatedSites(small, 99)).toEqual([]);
  });
});
