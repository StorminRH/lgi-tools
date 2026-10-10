import { describe, expect, it } from 'vitest';
import { siteDetail, siteWave } from './__tests__/site-fixtures';
import { sortSitesForTable } from './sort';

describe('sortSitesForTable', () => {
  it('returns input unchanged when sortKey is null (default landing state)', () => {
    const a = siteDetail({ siteType: 'combat', name: 'Zebra' });
    const b = siteDetail({ siteType: 'combat', name: 'Alpha' });
    const result = sortSitesForTable([a, b], null, 'desc');
    expect(result).toEqual([a, b]);
  });

  it('sorts by name asc/desc with localeCompare', () => {
    const a = siteDetail({ id: 1, siteType: 'combat', name: 'Banana' });
    const b = siteDetail({ id: 2, siteType: 'combat', name: 'apple' });
    const c = siteDetail({ id: 3, siteType: 'combat', name: 'Cherry' });
    const asc = sortSitesForTable([a, b, c], 'name', 'asc').map((s) => s.id);
    const desc = sortSitesForTable([a, b, c], 'name', 'desc').map((s) => s.id);
    expect(asc).toEqual([2, 1, 3]);
    expect(desc).toEqual([3, 1, 2]);
  });

  it('sorts by type using TYPE_ORDER (combat→ore→gas→relic→data)', () => {
    const sites = [
      siteDetail({ id: 4, siteType: 'relic' }),
      siteDetail({ id: 1, siteType: 'combat' }),
      siteDetail({ id: 3, siteType: 'gas' }),
      siteDetail({ id: 2, siteType: 'ore' }),
      siteDetail({ id: 5, siteType: 'data' }),
    ];
    const asc = sortSitesForTable(sites, 'type', 'asc').map((s) => s.id);
    expect(asc).toEqual([1, 2, 3, 4, 5]);
  });

  it('sorts by isk numeric, picking blueLootIsk for wave-driven and resourceValueIsk for ore/gas', () => {
    const combat = siteDetail({ id: 1, siteType: 'combat', blueLootIsk: 500, resourceValueIsk: 0 });
    const ore = siteDetail({ id: 2, siteType: 'ore', blueLootIsk: 0, resourceValueIsk: 200 });
    const relic = siteDetail({ id: 3, siteType: 'relic', blueLootIsk: 100, resourceValueIsk: 0 });
    const desc = sortSitesForTable([ore, combat, relic], 'isk', 'desc').map((s) => s.id);
    expect(desc).toEqual([1, 2, 3]);
  });

  it('sorts nulls to the end regardless of direction', () => {
    const withIsk = siteDetail({ id: 1, siteType: 'combat', blueLootIsk: 100 });
    const noIsk = siteDetail({ id: 2, siteType: 'ore', blueLootIsk: null, resourceValueIsk: null });
    const desc = sortSitesForTable([noIsk, withIsk], 'isk', 'desc').map((s) => s.id);
    const asc = sortSitesForTable([noIsk, withIsk], 'isk', 'asc').map((s) => s.id);
    expect(desc).toEqual([1, 2]);
    expect(asc).toEqual([1, 2]);
  });

  it('sorts by blue loot using site.blueLootIsk, with nulls last', () => {
    const high = siteDetail({ id: 1, siteType: 'combat', blueLootIsk: 999 });
    const low = siteDetail({ id: 2, siteType: 'relic', blueLootIsk: 100 });
    const noLoot = siteDetail({ id: 3, siteType: 'ore', blueLootIsk: null });
    const desc = sortSitesForTable([low, noLoot, high], 'blueLoot', 'desc').map((s) => s.id);
    expect(desc).toEqual([1, 2, 3]);
  });

  it('sorts by scram count summed across all waves', () => {
    const heavy = siteDetail({
      id: 1, siteType: 'combat',
      waves: [siteWave({ ewScram: 3 }), siteWave({ ewScram: 2 })],
    });
    const light = siteDetail({
      id: 2, siteType: 'combat',
      waves: [siteWave({ ewScram: 1 })],
    });
    const none = siteDetail({ id: 3, siteType: 'ore', waves: [] });
    const desc = sortSitesForTable([light, none, heavy], 'scrams', 'desc').map((s) => s.id);
    expect(desc).toEqual([1, 2, 3]);
  });

  it('sorts by wormhole class C1→C6, with null class last', () => {
    const c1 = siteDetail({ id: 1, siteType: 'combat', wormholeClass: 'C1' });
    const c5 = siteDetail({ id: 2, siteType: 'combat', wormholeClass: 'C5' });
    const noClass = siteDetail({ id: 3, siteType: 'combat', wormholeClass: null });
    const asc = sortSitesForTable([c5, noClass, c1], 'class', 'asc').map((s) => s.id);
    expect(asc).toEqual([1, 2, 3]);
  });
});
