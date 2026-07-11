import { describe, expect, it } from 'vitest';
import type { SiteDetail, SiteResource, Wave } from '../types';
import { deriveSiteCardHeaderView } from './site-card-header-view';

const wave = (over: Partial<Wave> = {}): Wave => ({
  id: 1,
  waveNumber: 1,
  waveLabel: 'Wave 1',
  ewScram: 0,
  ewWeb: 0,
  ewNeut: 0,
  ewRrep: 0,
  dpsTotal: 0,
  alphaTotal: 0,
  ehpTotal: 0,
  npcs: [],
  ...over,
});

const site = (over: Partial<SiteDetail> = {}): SiteDetail => ({
  id: 1,
  name: 'Test Site',
  siteType: 'combat',
  wormholeClass: 'C5',
  signatureLabel: 'ABC-123',
  sourceTab: 'Sheet',
  blueLootIsk: 12_000_000,
  iskPerEhp: null,
  resourceValueIsk: null,
  waves: [],
  resources: [],
  ...over,
});

const resource = (name: string): SiteResource => ({
  id: 1,
  orderInSite: 0,
  resourceKind: 'ore',
  resourceName: name,
  units: null,
  volumeM3: null,
  iskPerM3: null,
  totalIsk: null,
  typeId: null,
  liveIsk: null,
  effectiveIsk: null,
  liveEligible: false,
});

describe('deriveSiteCardHeaderView', () => {
  it('uses a DPS/EHP sub-line and shows the ISK unit for a combat site', () => {
    const view = deriveSiteCardHeaderView(
      site({ waves: [wave({ dpsTotal: 300, ehpTotal: 40_000 }), wave({ dpsTotal: 500, ehpTotal: 60_000 })] }),
      [],
    );
    expect(view.subLine).toBe('DPS 500 · EHP 100k');
    expect(view.isWaveDriven).toBe(true);
    expect(view.showIskUnit).toBe(true);
  });

  it('lists resource names for a non-combat site and hides the ISK unit when unpriced', () => {
    const view = deriveSiteCardHeaderView(
      site({ siteType: 'ore', wormholeClass: null, blueLootIsk: null }),
      [resource('Arkonor'), resource('Bistot')],
    );
    expect(view.subLine).toBe('Arkonor · Bistot');
    expect(view.isWaveDriven).toBe(false);
    expect(view.showIskUnit).toBe(false);
  });

  it('resolves the class pill from the wormhole class', () => {
    const view = deriveSiteCardHeaderView(site({ wormholeClass: 'C5' }), []);
    expect(view.classPill).toEqual({ tone: 'red', label: 'C5' });
    expect(view.typePill).toEqual({ tone: 'red-soft', label: 'Combat' });
  });

  it('has no class pill for a classless non-gas site', () => {
    expect(deriveSiteCardHeaderView(site({ siteType: 'ore', wormholeClass: null }), []).classPill).toBeNull();
  });

  it('surfaces the EWAR pills fielded across waves in order', () => {
    const view = deriveSiteCardHeaderView(
      site({ waves: [wave({ ewWeb: 2, ewNeut: 1 })] }),
      [],
    );
    expect(view.ewarPills.map((p) => p.key)).toEqual(['web', 'neut']);
    expect(view.ewarPills[0]).toEqual({ key: 'web', tone: 'blue', label: 'WEB' });
  });
});
