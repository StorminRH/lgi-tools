import { describe, expect, it } from 'vitest';
import { siteDetail, siteResource, siteWave } from '../__tests__/site-fixtures';
import { deriveSiteCardHeaderView } from './site-card-header-view';

describe('deriveSiteCardHeaderView', () => {
  it('uses a DPS/EHP sub-line and shows the ISK unit for a combat site', () => {
    const view = deriveSiteCardHeaderView(
      siteDetail({
        siteType: 'combat',
        blueLootIsk: 12_000_000,
        waves: [
          siteWave({ dpsTotal: 300, ehpTotal: 40_000 }),
          siteWave({ dpsTotal: 500, ehpTotal: 60_000 }),
        ],
      }),
      [],
    );
    expect(view.subLine).toBe('DPS 500 · EHP 100k');
    expect(view.isWaveDriven).toBe(true);
    expect(view.showIskUnit).toBe(true);
  });

  it('lists resource names for a non-combat site and hides the ISK unit when unpriced', () => {
    const view = deriveSiteCardHeaderView(
      siteDetail({ siteType: 'ore', wormholeClass: null, blueLootIsk: null }),
      [siteResource({ resourceName: 'Arkonor' }), siteResource({ resourceName: 'Bistot' })],
    );
    expect(view.subLine).toBe('Arkonor · Bistot');
    expect(view.isWaveDriven).toBe(false);
    expect(view.showIskUnit).toBe(false);
  });

  it('resolves the class pill from the wormhole class', () => {
    const view = deriveSiteCardHeaderView(siteDetail({ siteType: 'combat', wormholeClass: 'C5' }), []);
    expect(view.classPill).toEqual({ tone: 'red', label: 'C5' });
    expect(view.typePill).toEqual({ tone: 'red-soft', label: 'Combat' });
  });

  it('has no class pill for a classless non-gas site', () => {
    expect(deriveSiteCardHeaderView(siteDetail({ siteType: 'ore', wormholeClass: null }), []).classPill).toBeNull();
  });

  it('surfaces the EWAR pills fielded across waves in order', () => {
    const view = deriveSiteCardHeaderView(
      siteDetail({ waves: [siteWave({ ewWeb: 2, ewNeut: 1 })] }),
      [],
    );
    expect(view.ewarPills.map((p) => p.key)).toEqual(['web', 'neut']);
    expect(view.ewarPills[0]).toEqual({ key: 'web', tone: 'blue', label: 'WEB' });
  });
});
