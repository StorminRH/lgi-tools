import { describe, expect, it } from 'vitest';
import type { SiteDetail } from '../types';
import { deriveSiteDetailsView } from './site-details-view';

const site = (over: Partial<SiteDetail> = {}): SiteDetail => ({
  id: 1,
  name: 'Test Site',
  siteType: 'combat',
  wormholeClass: 'C5',
  signatureLabel: 'ABC-123',
  sourceTab: 'Sheet',
  blueLootIsk: null,
  iskPerEhp: null,
  resourceValueIsk: null,
  waves: [],
  resources: [],
  ...over,
});

describe('deriveSiteDetailsView', () => {
  it('marks combat and hackable sites wave-driven', () => {
    expect(deriveSiteDetailsView(site({ siteType: 'combat' })).isWaveDriven).toBe(true);
    expect(deriveSiteDetailsView(site({ siteType: 'relic' })).isWaveDriven).toBe(true);
    expect(deriveSiteDetailsView(site({ siteType: 'data' })).isWaveDriven).toBe(true);
    expect(deriveSiteDetailsView(site({ siteType: 'ore' })).isWaveDriven).toBe(false);
    expect(deriveSiteDetailsView(site({ siteType: 'gas' })).isWaveDriven).toBe(false);
  });

  it('flags gas, resource presence, and wave presence', () => {
    const view = deriveSiteDetailsView(
      site({ siteType: 'gas', resources: [{} as never], waves: [{} as never] }),
    );
    expect(view.isGas).toBe(true);
    expect(view.hasResources).toBe(true);
    expect(view.hasWaves).toBe(true);
  });

  it('pulls the section copy from the site type', () => {
    const ore = deriveSiteDetailsView(site({ siteType: 'ore' }));
    expect(ore.sectionLabel).toBe('Ore Deposits');
    expect(ore.sectionHint).toBe('qty · m³ · est. ISK');
    expect(ore.footerLabel).toBe('Total ore value');

    const relic = deriveSiteDetailsView(site({ siteType: 'relic' }));
    expect(relic.sectionLabel).toBe('Hackable Containers');
    expect(relic.footerLabel).toBe('Total container value');
  });
});
