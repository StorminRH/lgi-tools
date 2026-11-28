import { expect, test } from 'vitest';
import { siteDetail, siteNpc, siteWave } from './__tests__/site-fixtures';
import { summariseSiteShipClasses } from './npc-summary';
import type { Npc, SiteDetail } from './types';

function mkNpc(code: string, typeId: number, quantity: number, order = 0): Npc {
  return siteNpc({
    id: typeId * 1000 + order,
    orderInWave: order,
    quantity,
    sleeperName: `${code}-${typeId}`,
    sleeperClassCode: code,
  });
}

/** One site whose waves field the given NPCs, wave by wave. */
const mkSite = (waves: Npc[][]): SiteDetail =>
  siteDetail({ waves: waves.map((npcs) => siteWave({ npcs })) });

test('summariseSiteShipClasses sums each known class across waves and types, ordered by hull size then sentry', () => {
  const summary = summariseSiteShipClasses(mkSite([
    [mkNpc('B', 30196, 6, 0), mkNpc('F', 30209, 4, 1), mkNpc('X', 99999, 4, 2)],
    [mkNpc('C', 30200, 12, 0), mkNpc('F', 30215, 2, 1), mkNpc('F', 30216, 1, 2), mkNpc('T', 30460, 2, 3)],
  ]));
  // Unknown class codes are dropped; several F types fold into one entry.
  expect(summary).toEqual([
    { code: 'F', count: 7 },
    { code: 'C', count: 12 },
    { code: 'B', count: 6 },
    { code: 'T', count: 2 },
  ]);

  expect(summariseSiteShipClasses(mkSite([]))).toEqual([]);
});
