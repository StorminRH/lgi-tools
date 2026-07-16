import type { CombatStats } from '@/data/npc-stats/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SiteListItem } from './types';

// Dequeue at select creation so concurrent wave/resource reads keep call order;
// the fluent thenable shape exercises outcomes without coupling tests to SQL.
const h = vi.hoisted(() => {
  const state = { results: [] as unknown[] };
  const select = vi.fn(() => {
    const result = state.results.shift() ?? [];
    const builder: Record<string, unknown> = {};
    for (const method of ['from', 'where', 'orderBy']) {
      builder[method] = () => builder;
    }
    builder.then = (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject);
    return builder;
  });
  return {
    state,
    select,
    cacheLife: vi.fn(),
    cacheTag: vi.fn(),
    getCombatStatsBatch: vi.fn(),
  };
});

vi.mock('next/cache', () => ({
  cacheLife: h.cacheLife,
  cacheTag: h.cacheTag,
}));

vi.mock('@/db', () => ({
  db: { select: h.select },
}));

vi.mock('@/data/npc-stats/queries', () => ({
  getCombatStatsBatch: h.getCombatStatsBatch,
}));

import { listSiteDetails } from './queries';

function siteRow(
  id: number,
  values: Partial<SiteListItem> = {},
): SiteListItem {
  return {
    id,
    name: `Site ${id}`,
    siteType: 'combat',
    wormholeClass: 'C3',
    signatureLabel: 'Anomaly',
    sourceTab: 'C3',
    blueLootIsk: 1_000,
    iskPerEhp: 2,
    resourceValueIsk: null,
    ...values,
  };
}

function combatStats(values: {
  dps: number;
  alpha: number;
  ehp: number;
  scram?: number;
  web?: number;
  neut?: number;
  rrep?: number;
  sig?: number;
  speed?: number;
  distance?: number;
  velocity?: number;
}): CombatStats {
  const damage = { em: 0, therm: 0, kin: 0, exp: 0, total: 0 };
  return {
    turret: { dps: damage, alpha: damage },
    missile: { dps: damage, alpha: damage },
    total: { dps: values.dps, alpha: values.alpha },
    hp: {
      shield: 0,
      armor: 0,
      structure: 0,
      ehp: values.ehp,
      shieldRes: { em: 0, exp: 0, kin: 0, therm: 0 },
      armorRes: { em: 0, exp: 0, kin: 0, therm: 0 },
    },
    ewar: {
      scram: values.scram ?? 0,
      web: values.web ?? 0,
      neutAmount: 0,
      neutDuration: 0,
      neutCount: values.neut ?? 0,
      rrepAmount: 0,
      rrepDuration: 0,
      rrepCount: values.rrep ?? 0,
    },
    movement: {
      sigRadius: values.sig ?? 0,
      maxVelocity: values.speed ?? 0,
      orbitDistance: values.distance ?? 0,
      orbitVelocity: values.velocity ?? 0,
    },
  };
}

beforeEach(() => {
  h.state.results = [];
  h.select.mockClear();
  h.cacheLife.mockReset();
  h.cacheTag.mockReset();
  h.getCombatStatsBatch.mockReset();
});

describe('listSiteDetails', () => {
  it('short-circuits an empty catalogue without dependent reads', async () => {
    h.state.results = [[]];

    await expect(listSiteDetails({})).resolves.toEqual([]);

    expect(h.select).toHaveBeenCalledTimes(1);
    expect(h.getCombatStatsBatch).not.toHaveBeenCalled();
    expect(h.state.results).toEqual([]);
  });

  it('assembles filtered sites with weighted combat, per-type EWAR, and raw resources', async () => {
    const included = siteRow(1);
    const excludedClass = siteRow(2, { wormholeClass: 'C4' });
    const emptyDetail = siteRow(3, { name: 'Empty C3 site' });
    const statsA = combatStats({
      dps: 10.4,
      alpha: 20.2,
      ehp: 100.1,
      scram: 2,
      web: -60,
      neut: 3,
      sig: 45,
      speed: 120,
      distance: 15_000,
      velocity: 80,
    });
    const statsB = combatStats({
      dps: 5.1,
      alpha: 7.6,
      ehp: 50.4,
      rrep: 4,
      sig: 60,
      speed: 90,
      distance: 20_000,
      velocity: 70,
    });
    const resourceA = {
      id: 501,
      siteId: 1,
      orderInSite: 1,
      resourceKind: 'gas',
      resourceName: 'Fullerite-A',
      units: 10,
      volumeM3: 100,
      iskPerM3: 50,
      totalIsk: 5_000,
      typeId: 1_001,
    };
    const resourceB = {
      id: 502,
      siteId: 1,
      orderInSite: 2,
      resourceKind: 'gas',
      resourceName: 'Fullerite-B',
      units: null,
      volumeM3: null,
      iskPerM3: null,
      totalIsk: null,
      typeId: null,
    };

    h.state.results = [
      [included, excludedClass, emptyDetail],
      [
        { id: 11, siteId: 1, waveNumber: 1, waveLabel: 'Initial' },
        { id: 12, siteId: 1, waveNumber: 2, waveLabel: 'Reinforcement' },
        { id: 13, siteId: 1, waveNumber: 3, waveLabel: 'Empty' },
      ],
      [resourceA, resourceB],
      [
        {
          id: 101,
          waveId: 11,
          typeId: 100,
          orderInWave: 1,
          triggerLabel: 'Trigger',
          quantity: 3,
          sleeperName: 'Scramming Sleeper',
          sleeperClassCode: 'F',
        },
        {
          id: 102,
          waveId: 11,
          typeId: 200,
          orderInWave: 2,
          triggerLabel: null,
          quantity: 2,
          sleeperName: 'Repairing Sleeper',
          sleeperClassCode: 'C',
        },
        {
          id: 103,
          waveId: 11,
          typeId: 300,
          orderInWave: 3,
          triggerLabel: null,
          quantity: 4,
          sleeperName: 'Unknown Sleeper',
          sleeperClassCode: 'B',
        },
        {
          id: 104,
          waveId: 12,
          typeId: 100,
          orderInWave: 1,
          triggerLabel: null,
          quantity: 1,
          sleeperName: 'Scramming Sleeper',
          sleeperClassCode: 'F',
        },
      ],
    ];
    h.getCombatStatsBatch.mockResolvedValue(new Map([
      [100, statsA],
      [200, statsB],
    ]));

    const result = await listSiteDetails({
      type: 'combat',
      wormholeClass: 'C3',
    });

    expect(result.map((site) => site.id)).toEqual([1, 3]);
    expect(h.select).toHaveBeenCalledTimes(4);
    expect(h.getCombatStatsBatch).toHaveBeenCalledWith([100, 200, 300]);

    const firstWave = result[0]?.waves[0];
    expect(firstWave).toMatchObject({
      id: 11,
      waveNumber: 1,
      waveLabel: 'Initial',
      ewScram: 2,
      ewWeb: 1,
      ewNeut: -3,
      ewRrep: 4,
      dpsTotal: 41,
      alphaTotal: 76,
      ehpTotal: 401,
    });
    expect(firstWave?.npcs[0]).toEqual({
      id: 101,
      orderInWave: 1,
      triggerLabel: 'Trigger',
      quantity: 3,
      sleeperName: 'Scramming Sleeper',
      sleeperClassCode: 'F',
      scram: 2,
      web: 1,
      neut: -3,
      rrep: 0,
      sig: 45,
      speed: 120,
      distance: 15_000,
      velocity: 80,
      dps: 10,
      alpha: 20,
      ehp: 100,
    });
    expect(firstWave?.npcs[1]).toMatchObject({
      id: 102,
      scram: 0,
      web: 0,
      neut: -0,
      rrep: 4,
      dps: 5,
      alpha: 8,
      ehp: 50,
    });
    expect(firstWave?.npcs[2]).toMatchObject({
      id: 103,
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
    expect(result[0]?.waves[1]).toMatchObject({
      dpsTotal: 10,
      alphaTotal: 20,
      ehpTotal: 100,
      ewScram: 2,
      ewWeb: 1,
      ewNeut: -3,
      ewRrep: null,
    });
    expect(result[0]?.waves[2]).toEqual({
      id: 13,
      waveNumber: 3,
      waveLabel: 'Empty',
      ewScram: null,
      ewWeb: null,
      ewNeut: null,
      ewRrep: null,
      dpsTotal: 0,
      alphaTotal: 0,
      ehpTotal: 0,
      npcs: [],
    });
    expect(result[0]?.resources).toEqual([
      {
        id: 501,
        orderInSite: 1,
        resourceKind: 'gas',
        resourceName: 'Fullerite-A',
        units: 10,
        volumeM3: 100,
        iskPerM3: 50,
        totalIsk: 5_000,
        typeId: 1_001,
        liveIsk: null,
        effectiveIsk: 5_000,
        liveEligible: false,
      },
      {
        id: 502,
        orderInSite: 2,
        resourceKind: 'gas',
        resourceName: 'Fullerite-B',
        units: null,
        volumeM3: null,
        iskPerM3: null,
        totalIsk: null,
        typeId: null,
        liveIsk: null,
        effectiveIsk: null,
        liveEligible: false,
      },
    ]);
    expect(result[1]).toEqual({ ...emptyDetail, waves: [], resources: [] });
  });

  it('matches gas class ranges while excluding out-of-range and unknown gas sites', async () => {
    const perimeter = siteRow(4, {
      name: 'Barren Perimeter Reservoir',
      siteType: 'gas',
      wormholeClass: null,
    });
    const frontier = siteRow(5, {
      name: 'Bountiful Frontier Reservoir',
      siteType: 'gas',
      wormholeClass: null,
    });
    const unknown = siteRow(6, {
      name: 'Unknown Reservoir',
      siteType: 'gas',
      wormholeClass: null,
    });
    const exactClass = siteRow(7, { wormholeClass: 'C2' });
    h.state.results = [
      [perimeter, frontier, unknown, exactClass],
      [],
      [],
    ];
    h.getCombatStatsBatch.mockResolvedValue(new Map());

    const result = await listSiteDetails({ wormholeClass: 'C2' });

    expect(result).toEqual([
      { ...perimeter, waves: [], resources: [] },
      { ...exactClass, waves: [], resources: [] },
    ]);
    expect(h.select).toHaveBeenCalledTimes(3);
    expect(h.getCombatStatsBatch).toHaveBeenCalledWith([]);
  });
});
