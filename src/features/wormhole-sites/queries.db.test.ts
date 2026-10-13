import { beforeAll, expect, test, vi } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import { siteDetail, siteResource, siteWave } from './__tests__/site-fixtures';
import { npcs, siteResources, sites, waves } from './schema';
import type { Npc, SiteListItem } from './types';

vi.mock('next/cache', () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
}));

import { getPricedSiteDetail, listSiteDetails, listSites } from './queries';

const harness = await createDbTestHarness({
  schema: 'test_wormhole_site_queries',
  tables: ['sites', 'waves', 'npcs', 'site_resources', 'type_dogma'],
  steerDbProxy: true,
});

const site = (
  id: number,
  sourceTab: string,
  name: string,
  values: Partial<SiteListItem> = {},
): SiteListItem => ({
  id,
  name,
  siteType: 'combat',
  wormholeClass: null,
  signatureLabel: 'Anomaly',
  sourceTab,
  blueLootIsk: null,
  iskPerEhp: null,
  resourceValueIsk: null,
  ...values,
});

// Inserted out of (sourceTab, name) order, so the read has to sort them.
const perimeterGas = site(3, 'Gas', 'Barren Perimeter Reservoir', { siteType: 'gas' });
const frontierGas = site(4, 'Gas', 'Bountiful Frontier Reservoir', { siteType: 'gas' });
const unknownGas = site(5, 'Gas', 'Unknown Reservoir', { siteType: 'gas' });
const classedGas = site(6, 'C4', 'Barren Perimeter Reservoir', {
  siteType: 'gas',
  wormholeClass: 'C4',
});
const outpost = site(1, 'C3', 'Sleeper Outpost', {
  wormholeClass: 'C3',
  blueLootIsk: 12_000_000,
  iskPerEhp: 40,
});
const hideaway = site(2, 'C2', 'Sleeper Hideaway', { wormholeClass: 'C2' });
const relic = site(7, 'C2', 'Forgotten Relic Site', { siteType: 'relic', wormholeClass: 'C2' });

/** An NPC whose type has no dogma, so every combat field reads unknown. */
const unscoredNpc = (
  values: Pick<Npc, 'id' | 'orderInWave' | 'triggerLabel' | 'quantity' | 'sleeperName'>,
): Npc => ({
  ...values,
  sleeperClassCode: 'F',
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
});

beforeAll(async () => {
  if (!harness.reachable) return;
  await harness.db
    .insert(sites)
    .values([perimeterGas, frontierGas, unknownGas, classedGas, outpost, hideaway, relic]);
  await harness.db.insert(waves).values([
    { id: 12, siteId: 1, waveNumber: 2, waveLabel: 'Reinforcement' },
    { id: 11, siteId: 1, waveNumber: 1, waveLabel: 'Initial' },
    { id: 21, siteId: 2, waveNumber: 1, waveLabel: 'Initial' },
  ]);
  await harness.db.insert(npcs).values([
    { id: 112, waveId: 11, orderInWave: 2, triggerLabel: null, quantity: 3, sleeperName: 'Warden', sleeperClassCode: 'F', typeId: 30_002 },
    { id: 111, waveId: 11, orderInWave: 1, triggerLabel: 'Trigger', quantity: 1, sleeperName: 'Sentinel', sleeperClassCode: 'F', typeId: 30_001 },
    { id: 121, waveId: 12, orderInWave: 1, triggerLabel: null, quantity: 2, sleeperName: 'Warden', sleeperClassCode: 'F', typeId: 30_002 },
    { id: 211, waveId: 21, orderInWave: 1, triggerLabel: null, quantity: 4, sleeperName: 'Watchman', sleeperClassCode: 'F', typeId: 30_003 },
  ]);
  await harness.db.insert(siteResources).values([
    { id: 32, siteId: 3, orderInSite: 2, resourceKind: 'gas', resourceName: 'Fullerite-C28', units: null, volumeM3: null, iskPerM3: null, totalIsk: null, typeId: null },
    { id: 31, siteId: 3, orderInSite: 1, resourceKind: 'gas', resourceName: 'Fullerite-C50', units: 3_000, volumeM3: 3_000, iskPerM3: 900, totalIsk: 2_700_000, typeId: null },
  ]);
});

test.skipIf(!harness.reachable)(
  'listSites filters by type in SQL and by spawn class through siteClassSet, ordered by tab then name',
  async () => {
    const ids = (rows: SiteListItem[]) => rows.map((row) => row.id);

    // C2 < C3 < C4 < Gas by tab, then by name within a tab.
    await expect(listSites({}).then(ids)).resolves.toEqual([7, 2, 1, 6, 3, 4, 5]);
    await expect(listSites({ type: 'gas' }).then(ids)).resolves.toEqual([6, 3, 4, 5]);

    // C2 matches a declared C2 site of any type and a classless gas site whose
    // name spawns C1 to C6. A gas site that declares C4 stays out, as do the
    // C3+ Frontier range and a name with no range.
    await expect(listSites({ wormholeClass: 'C2' }).then(ids)).resolves.toEqual([7, 2, 3]);
    await expect(listSites({ type: 'gas', wormholeClass: 'C2' })).resolves.toEqual([perimeterGas]);
    await expect(listSites({ type: 'ore' })).resolves.toEqual([]);
  },
);

test.skipIf(!harness.reachable)(
  'site details join each wave to its NPCs, keep tab order, and read one site alone',
  async () => {
    const outpostDetail = siteDetail({
      ...outpost,
      waves: [
        siteWave({
          id: 11,
          waveNumber: 1,
          waveLabel: 'Initial',
          npcs: [
            unscoredNpc({ id: 111, orderInWave: 1, triggerLabel: 'Trigger', quantity: 1, sleeperName: 'Sentinel' }),
            unscoredNpc({ id: 112, orderInWave: 2, triggerLabel: null, quantity: 3, sleeperName: 'Warden' }),
          ],
        }),
        siteWave({
          id: 12,
          waveNumber: 2,
          waveLabel: 'Reinforcement',
          npcs: [
            unscoredNpc({ id: 121, orderInWave: 1, triggerLabel: null, quantity: 2, sleeperName: 'Warden' }),
          ],
        }),
      ],
    });
    const perimeterDetail = siteDetail({
      ...perimeterGas,
      resources: [
        siteResource({
          id: 31,
          orderInSite: 1,
          resourceKind: 'gas',
          resourceName: 'Fullerite-C50',
          units: 3_000,
          volumeM3: 3_000,
          iskPerM3: 900,
          totalIsk: 2_700_000,
        }),
        siteResource({ id: 32, orderInSite: 2, resourceKind: 'gas', resourceName: 'Fullerite-C28' }),
      ],
    });

    const catalogue = await listSiteDetails();

    expect(catalogue.map((detail) => detail.id)).toEqual([7, 2, 1, 6, 3, 4, 5]);
    expect(catalogue.find((detail) => detail.id === 1)).toEqual(outpostDetail);
    expect(catalogue.find((detail) => detail.id === 3)).toEqual(perimeterDetail);
    expect(catalogue.find((detail) => detail.id === 2)?.waves).toEqual([
      siteWave({
        id: 21,
        waveLabel: 'Initial',
        npcs: [
          unscoredNpc({ id: 211, orderInWave: 1, triggerLabel: null, quantity: 4, sleeperName: 'Watchman' }),
        ],
      }),
    ]);
    expect(catalogue.find((detail) => detail.id === 7)).toEqual(siteDetail(relic));

    await expect(getPricedSiteDetail(1)).resolves.toEqual(outpostDetail);
    await expect(getPricedSiteDetail(3)).resolves.toEqual(perimeterDetail);
    await expect(getPricedSiteDetail(999)).resolves.toBeNull();
  },
);
