import { expect, test } from 'vitest';
import { siteDetail, siteResource, siteWave } from './__tests__/site-fixtures';
import { buildSiteDescription, deriveSiteMeta } from './site-meta';

test('a site description leads a wave-driven site with its loot and waves, and a resource site with its harvestables', () => {
  const garrison = buildSiteDescription(
    siteDetail({
      name: 'Core Garrison',
      siteType: 'combat',
      blueLootIsk: 45_000_000,
      waves: [siteWave({ waveNumber: 1 }), siteWave({ waveNumber: 2 })],
    }),
    'Combat',
    'C5',
  );
  expect(garrison.startsWith('Core Garrison is a C5 combat site')).toBe(true);
  expect(garrison).toContain('45M ISK estimated blue-loot value');
  expect(garrison).toContain('2 NPC waves');

  const lootless = buildSiteDescription(
    siteDetail({ siteType: 'relic', blueLootIsk: 0, waves: [siteWave({ waveNumber: 1 })] }),
    'Relic',
    null,
  );
  expect(lootless).toContain('sleeper loot');
  expect(lootless).toContain('1 NPC wave,');
  expect(lootless).not.toContain('waves');

  const reservoir = buildSiteDescription(
    siteDetail({
      name: 'Ordinary Perimeter Reservoir',
      siteType: 'ore',
      resourceValueIsk: 12_000_000,
      resources: [
        siteResource({ resourceName: 'Arkonor' }),
        siteResource({ resourceName: 'Bistot' }),
      ],
    }),
    'Ore',
    'C6',
  );
  expect(reservoir).toContain('Arkonor, Bistot');
  expect(reservoir).toContain('12M ISK at live Jita prices');
});

test('a site title carries its class, a class-less gas site reads as Wormhole, and a class-less non-gas site has no class', () => {
  const classed = deriveSiteMeta(siteDetail({ name: 'Core Garrison', siteType: 'combat', wormholeClass: 'C5' }));
  expect(classed.title).toBe('Core Garrison — C5 Combat');

  const gas = deriveSiteMeta(siteDetail({ name: 'Barren Perimeter', siteType: 'gas', wormholeClass: null }));
  expect(gas.title).toBe('Barren Perimeter — Wormhole Gas');
  expect(gas.classLabel).toBe('Wormhole');

  const ore = deriveSiteMeta(siteDetail({ name: 'Unknown', siteType: 'ore', wormholeClass: null }));
  expect(ore.title).toBe('Unknown — Ore');
  expect(ore.classLabel).toBeNull();
});
