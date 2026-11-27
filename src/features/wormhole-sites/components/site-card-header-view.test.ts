import { expect, test } from 'vitest';
import { siteDetail, siteResource, siteWave } from '../__tests__/site-fixtures';
import { deriveSiteCardHeaderView } from './site-card-header-view';
import { CLASS_TONE } from './wormhole-styles';

test('deriveSiteCardHeaderView uses a DPS/EHP sub-line and shows the ISK unit for a combat site', () => {
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
  expect(view.waveValue).toBe('12.0M');
  expect(view.showIskUnit).toBe(true);
});

test('deriveSiteCardHeaderView shows a sub-million blue-loot value in thousands, as the sites table does', () => {
  const view = deriveSiteCardHeaderView(siteDetail({ siteType: 'relic', blueLootIsk: 950_000 }), []);
  expect(view.waveValue).toBe('950K');
  expect(view.showIskUnit).toBe(true);
});

test('deriveSiteCardHeaderView lists resource names for a non-combat site and hides the ISK unit when unpriced', () => {
  const view = deriveSiteCardHeaderView(
    siteDetail({ siteType: 'ore', wormholeClass: null, blueLootIsk: null }),
    [siteResource({ resourceName: 'Arkonor' }), siteResource({ resourceName: 'Bistot' })],
  );
  expect(view.subLine).toBe('Arkonor · Bistot');
  expect(view.isWaveDriven).toBe(false);
  expect(view.showIskUnit).toBe(false);
});

test('deriveSiteCardHeaderView resolves the class pill from the class, a class-less gas site’s spawn range, or none', () => {
  const combat = deriveSiteCardHeaderView(siteDetail({ siteType: 'combat', wormholeClass: 'C5' }), []);
  expect(combat.classPill).toEqual({ tone: 'red', label: 'C5' });
  expect(combat.typePill).toEqual({ tone: 'red-soft', label: 'Combat' });

  const gas = deriveSiteCardHeaderView(
    siteDetail({ siteType: 'gas', wormholeClass: null, name: 'Barren Perimeter Reservoir' }),
    [],
  );
  // Toned by its lowest class.
  expect(gas.classPill).toEqual({ tone: CLASS_TONE.C1, label: 'C1–C6' });

  expect(deriveSiteCardHeaderView(siteDetail({ siteType: 'ore', wormholeClass: null }), []).classPill).toBeNull();
});

test('deriveSiteCardHeaderView surfaces the EWAR pills fielded across waves in order', () => {
  const view = deriveSiteCardHeaderView(
    siteDetail({ waves: [siteWave({ ewWeb: 2, ewNeut: 1 })] }),
    [],
  );
  expect(view.ewarPills.map((p) => p.key)).toEqual(['web', 'neut']);
  expect(view.ewarPills[0]).toEqual({ key: 'web', tone: 'blue', label: 'WEB' });
});
