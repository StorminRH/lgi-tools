import { describe, expect, it } from 'vitest';
import { siteDetail, siteWave } from './__tests__/site-fixtures';
import { summariseSiteShipClasses } from './npc-summary';
import type { Npc, SiteDetail } from './types';

function mkNpc(code: string, typeId: number, quantity: number, order = 0): Npc {
  return {
    id: typeId * 1000 + order,
    orderInWave: order,
    triggerLabel: null,
    quantity,
    sleeperName: `${code}-${typeId}`,
    sleeperClassCode: code,
    scram: null,
    web: null,
    neut: null,
    rrep: null,
    sig: null,
    speed: null,
    distance: null,
    velocity: null,
    dps: null,
    alpha: null,
    ehp: null,
  };
}

/** One site whose waves field the given NPCs, wave by wave. */
const mkSite = (waves: Npc[][]): SiteDetail =>
  siteDetail({ waves: waves.map((npcs) => siteWave({ npcs })) });

describe('summariseSiteShipClasses', () => {
  it('sums counts across waves and orders by hull size then sentry', () => {
    const site = mkSite([
      [mkNpc('B', 30196, 6, 0), mkNpc('F', 30209, 4, 1)],
      [mkNpc('C', 30200, 12, 0), mkNpc('F', 30209, 3, 1), mkNpc('T', 30460, 2, 2)],
    ]);

    const summary = summariseSiteShipClasses(site);

    expect(summary.map((s) => s.code)).toEqual(['F', 'C', 'B', 'T']);
    expect(summary.find((s) => s.code === 'F')?.count).toBe(7);
    expect(summary.find((s) => s.code === 'C')?.count).toBe(12);
    expect(summary.find((s) => s.code === 'B')?.count).toBe(6);
    expect(summary.find((s) => s.code === 'T')?.count).toBe(2);
  });

  it('folds multiple types of one class into a single summed entry', () => {
    const site = mkSite([
      [mkNpc('F', 30215, 2, 0), mkNpc('F', 30216, 9, 1), mkNpc('F', 30217, 3, 2)],
    ]);

    const summary = summariseSiteShipClasses(site);
    expect(summary).toHaveLength(1);
    expect(summary[0]).toEqual({ code: 'F', count: 14 });
  });

  it('ignores unknown class codes', () => {
    const site = mkSite([[mkNpc('X', 99999, 4, 0), mkNpc('F', 30209, 2, 1)]]);

    const summary = summariseSiteShipClasses(site);
    expect(summary.map((s) => s.code)).toEqual(['F']);
  });

  it('returns an empty array when there are no waves', () => {
    expect(summariseSiteShipClasses(mkSite([]))).toEqual([]);
  });
});
