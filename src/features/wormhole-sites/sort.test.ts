import { describe, expect, it } from 'vitest';
import { sortSitesForTable } from './sort';
import type { SiteDetail, SiteType, Wave } from './types';

function makeWave(over: Partial<Wave> = {}): Wave {
  return {
    id: 1,
    waveNumber: 1,
    waveLabel: 'Initial',
    ewScram: 0, ewWeb: 0, ewNeut: 0, ewRrep: 0,
    dpsTotal: 0, alphaTotal: 0, ehpTotal: 0,
    npcs: [],
    ...over,
  };
}

function makeSite(over: Partial<SiteDetail> & { siteType: SiteType }): SiteDetail {
  return {
    id: 1,
    name: 'A site',
    wormholeClass: 'C1',
    signatureLabel: 'Cosmic Anomaly',
    sourceTab: 'Tab',
    blueLootIsk: null,
    iskPerEhp: null,
    resourceValueIsk: null,
    waves: [],
    resources: [],
    ...over,
  };
}

describe('sortSitesForTable', () => {
  it('returns input unchanged when sortKey is null (default landing state)', () => {
    const a = makeSite({ siteType: 'combat', name: 'Zebra' });
    const b = makeSite({ siteType: 'combat', name: 'Alpha' });
    const result = sortSitesForTable([a, b], null, 'desc');
    expect(result).toEqual([a, b]);
  });

  it('sorts by name asc/desc with localeCompare', () => {
    const a = makeSite({ id: 1, siteType: 'combat', name: 'Banana' });
    const b = makeSite({ id: 2, siteType: 'combat', name: 'apple' });
    const c = makeSite({ id: 3, siteType: 'combat', name: 'Cherry' });
    const asc = sortSitesForTable([a, b, c], 'name', 'asc').map((s) => s.id);
    const desc = sortSitesForTable([a, b, c], 'name', 'desc').map((s) => s.id);
    expect(asc).toEqual([2, 1, 3]);
    expect(desc).toEqual([3, 1, 2]);
  });

  it('sorts by type using TYPE_ORDER (combat→ore→gas→relic→data)', () => {
    const sites = [
      makeSite({ id: 4, siteType: 'relic' }),
      makeSite({ id: 1, siteType: 'combat' }),
      makeSite({ id: 3, siteType: 'gas' }),
      makeSite({ id: 2, siteType: 'ore' }),
      makeSite({ id: 5, siteType: 'data' }),
    ];
    const asc = sortSitesForTable(sites, 'type', 'asc').map((s) => s.id);
    expect(asc).toEqual([1, 2, 3, 4, 5]);
  });

  it('sorts by isk numeric, picking blueLootIsk for wave-driven and resourceValueIsk for ore/gas', () => {
    const combat = makeSite({ id: 1, siteType: 'combat', blueLootIsk: 500, resourceValueIsk: 0 });
    const ore = makeSite({ id: 2, siteType: 'ore', blueLootIsk: 0, resourceValueIsk: 200 });
    const relic = makeSite({ id: 3, siteType: 'relic', blueLootIsk: 100, resourceValueIsk: 0 });
    const desc = sortSitesForTable([ore, combat, relic], 'isk', 'desc').map((s) => s.id);
    expect(desc).toEqual([1, 2, 3]);
  });

  it('sorts nulls to the end regardless of direction', () => {
    const withIsk = makeSite({ id: 1, siteType: 'combat', blueLootIsk: 100 });
    const noIsk = makeSite({ id: 2, siteType: 'ore', blueLootIsk: null, resourceValueIsk: null });
    const desc = sortSitesForTable([noIsk, withIsk], 'isk', 'desc').map((s) => s.id);
    const asc = sortSitesForTable([noIsk, withIsk], 'isk', 'asc').map((s) => s.id);
    expect(desc).toEqual([1, 2]);
    expect(asc).toEqual([1, 2]);
  });

  it('sorts by blue loot using site.blueLootIsk, with nulls last', () => {
    const high = makeSite({ id: 1, siteType: 'combat', blueLootIsk: 999 });
    const low = makeSite({ id: 2, siteType: 'relic', blueLootIsk: 100 });
    const noLoot = makeSite({ id: 3, siteType: 'ore', blueLootIsk: null });
    const desc = sortSitesForTable([low, noLoot, high], 'blueLoot', 'desc').map((s) => s.id);
    expect(desc).toEqual([1, 2, 3]);
  });

  it('sorts by scram count summed across all waves', () => {
    const heavy = makeSite({
      id: 1, siteType: 'combat',
      waves: [makeWave({ ewScram: 3 }), makeWave({ ewScram: 2 })],
    });
    const light = makeSite({
      id: 2, siteType: 'combat',
      waves: [makeWave({ ewScram: 1 })],
    });
    const none = makeSite({ id: 3, siteType: 'ore', waves: [] });
    const desc = sortSitesForTable([light, none, heavy], 'scrams', 'desc').map((s) => s.id);
    expect(desc).toEqual([1, 2, 3]);
  });

  it('sorts by wormhole class C1→C6, with null class last', () => {
    const c1 = makeSite({ id: 1, siteType: 'combat', wormholeClass: 'C1' });
    const c5 = makeSite({ id: 2, siteType: 'combat', wormholeClass: 'C5' });
    const noClass = makeSite({ id: 3, siteType: 'combat', wormholeClass: null });
    const asc = sortSitesForTable([c5, noClass, c1], 'class', 'asc').map((s) => s.id);
    expect(asc).toEqual([1, 2, 3]);
  });
});
