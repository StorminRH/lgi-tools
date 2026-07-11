import { describe, it, expect } from 'vitest';
import { buildSiteDescription, deriveSiteMeta } from './site-meta';
import type { SiteDetail } from './types';

function makeSite(overrides: Partial<SiteDetail>): SiteDetail {
  return {
    id: 1,
    name: 'Site',
    siteType: 'combat',
    wormholeClass: null,
    signatureLabel: 'Anomaly',
    sourceTab: 'tab',
    blueLootIsk: null,
    iskPerEhp: null,
    resourceValueIsk: null,
    waves: [],
    resources: [],
    ...overrides,
  };
}

describe('buildSiteDescription', () => {
  it('leads a wave-driven site with blue-loot value and wave count', () => {
    const site = makeSite({
      name: 'Core Garrison',
      siteType: 'combat',
      blueLootIsk: 45_000_000,
      waves: [{ waveNumber: 1 }, { waveNumber: 2 }] as SiteDetail['waves'],
    });
    const desc = buildSiteDescription(site, 'Combat', 'C5');
    expect(desc).toContain('45M ISK estimated blue-loot value');
    expect(desc).toContain('2 NPC waves');
    expect(desc.startsWith('Core Garrison is a C5 combat site')).toBe(true);
  });

  it('uses singular "wave" and falls back to sleeper loot when no blue loot', () => {
    const site = makeSite({
      siteType: 'relic',
      blueLootIsk: 0,
      waves: [{ waveNumber: 1 }] as SiteDetail['waves'],
    });
    const desc = buildSiteDescription(site, 'Relic', null);
    expect(desc).toContain('sleeper loot');
    expect(desc).toContain('1 NPC wave,');
    expect(desc).not.toContain('waves');
  });

  it('leads a resource site with its harvestables and live value', () => {
    const site = makeSite({
      name: 'Ordinary Perimeter Reservoir',
      siteType: 'ore',
      resourceValueIsk: 12_000_000,
      resources: [
        { resourceName: 'Arkonor' },
        { resourceName: 'Bistot' },
      ] as SiteDetail['resources'],
    });
    const desc = buildSiteDescription(site, 'Ore', 'C6');
    expect(desc).toContain('Arkonor, Bistot');
    expect(desc).toContain('12M ISK at live Jita prices');
  });
});

describe('deriveSiteMeta', () => {
  it('builds "Name — Class Type" when a class is present', () => {
    const meta = deriveSiteMeta(makeSite({ name: 'Core Garrison', siteType: 'combat', wormholeClass: 'C5' }));
    expect(meta.title).toBe('Core Garrison — C5 Combat');
  });

  it('defaults a class-less gas site to "Wormhole Gas"', () => {
    const meta = deriveSiteMeta(makeSite({ name: 'Barren Perimeter', siteType: 'gas', wormholeClass: null }));
    expect(meta.title).toBe('Barren Perimeter — Wormhole Gas');
    expect(meta.classLabel).toBe('Wormhole');
  });

  it('omits the class segment for a class-less non-gas site', () => {
    const meta = deriveSiteMeta(makeSite({ name: 'Unknown', siteType: 'ore', wormholeClass: null }));
    expect(meta.title).toBe('Unknown — Ore');
    expect(meta.classLabel).toBeNull();
  });
});
