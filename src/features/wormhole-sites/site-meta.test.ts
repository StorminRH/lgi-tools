import { describe, it, expect } from 'vitest';
import { siteDetail, siteResource, siteWave } from './__tests__/site-fixtures';
import { buildSiteDescription, deriveSiteMeta } from './site-meta';

describe('buildSiteDescription', () => {
  it('leads a wave-driven site with blue-loot value and wave count', () => {
    const site = siteDetail({
      name: 'Core Garrison',
      siteType: 'combat',
      blueLootIsk: 45_000_000,
      waves: [siteWave({ waveNumber: 1 }), siteWave({ waveNumber: 2 })],
    });
    const desc = buildSiteDescription(site, 'Combat', 'C5');
    expect(desc).toContain('45M ISK estimated blue-loot value');
    expect(desc).toContain('2 NPC waves');
    expect(desc.startsWith('Core Garrison is a C5 combat site')).toBe(true);
  });

  it('uses singular "wave" and falls back to sleeper loot when no blue loot', () => {
    const site = siteDetail({
      siteType: 'relic',
      blueLootIsk: 0,
      waves: [siteWave({ waveNumber: 1 })],
    });
    const desc = buildSiteDescription(site, 'Relic', null);
    expect(desc).toContain('sleeper loot');
    expect(desc).toContain('1 NPC wave,');
    expect(desc).not.toContain('waves');
  });

  it('leads a resource site with its harvestables and live value', () => {
    const site = siteDetail({
      name: 'Ordinary Perimeter Reservoir',
      siteType: 'ore',
      resourceValueIsk: 12_000_000,
      resources: [
        siteResource({ resourceName: 'Arkonor' }),
        siteResource({ resourceName: 'Bistot' }),
      ],
    });
    const desc = buildSiteDescription(site, 'Ore', 'C6');
    expect(desc).toContain('Arkonor, Bistot');
    expect(desc).toContain('12M ISK at live Jita prices');
  });
});

describe('deriveSiteMeta', () => {
  it('builds "Name — Class Type" when a class is present', () => {
    const meta = deriveSiteMeta(siteDetail({ name: 'Core Garrison', siteType: 'combat', wormholeClass: 'C5' }));
    expect(meta.title).toBe('Core Garrison — C5 Combat');
  });

  it('defaults a class-less gas site to "Wormhole Gas"', () => {
    const meta = deriveSiteMeta(siteDetail({ name: 'Barren Perimeter', siteType: 'gas', wormholeClass: null }));
    expect(meta.title).toBe('Barren Perimeter — Wormhole Gas');
    expect(meta.classLabel).toBe('Wormhole');
  });

  it('omits the class segment for a class-less non-gas site', () => {
    const meta = deriveSiteMeta(siteDetail({ name: 'Unknown', siteType: 'ore', wormholeClass: null }));
    expect(meta.title).toBe('Unknown — Ore');
    expect(meta.classLabel).toBeNull();
  });
});
