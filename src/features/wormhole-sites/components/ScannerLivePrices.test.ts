import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, expect, test, vi } from 'vitest';
import { siteSearchEntry } from '../__tests__/site-fixtures';
import type { SiteSearchEntry } from '../queries';
import { SiteCatalogueProvider } from '../site-catalogue';
import {
  ScannerEstIskCell,
  ScannerLivePricesProvider,
} from './ScannerLivePrices';

const refresh = vi.hoisted(() => ({
  calls: [] as { typeIds: number[]; enabled: boolean; refreshKey?: string }[],
  isPending: (_typeId: number) => false as boolean,
  prices: new Map<number, { bestSell: number | null }>(),
}));

vi.mock('@/data/market-prices/use-refresh-on-view', () => ({
  useRefreshOnView: (typeIds: number[], opts: { enabled: boolean; refreshKey?: string }) => {
    refresh.calls.push({ typeIds: [...typeIds], enabled: opts.enabled, refreshKey: opts.refreshKey });
    return {
      prices: refresh.prices,
      isPending: (typeId: number) => refresh.isPending(typeId),
      refreshing: opts.enabled,
    };
  },
}));

afterEach(() => {
  refresh.calls = [];
  refresh.isPending = () => false;
  refresh.prices = new Map();
});

function render(siteIndex: readonly SiteSearchEntry[], node: ReactNode): string {
  return renderToStaticMarkup(
    createElement(SiteCatalogueProvider, { siteIndex }, createElement('div', null, node)),
  );
}

test('scanner live prices enable for harvestable recipes, settle LivePrice, and keep combat static', () => {
  const barren = siteSearchEntry({
    id: 49,
    name: 'Barren Perimeter Reservoir',
    siteType: 'gas',
    wormholeClass: null,
    resourceValueIsk: 28_100_000,
  });
  const barrenLive = {
    ...barren,
    liveRecipes: [{ typeId: 30370, units: 1_000, seedIsk: 28_100_000 }],
  };

  render(
    [barrenLive],
    createElement(
      ScannerLivePricesProvider,
      { harvestableNames: ['Barren Perimeter Reservoir'] },
      createElement(ScannerEstIskCell, {
        siteName: 'Barren Perimeter Reservoir',
        live: true,
      }),
    ),
  );
  expect(refresh.calls.at(-1)).toEqual({
    typeIds: [30370],
    enabled: true,
    refreshKey: '30370',
  });

  refresh.calls = [];
  render(
    [barren],
    createElement(
      ScannerLivePricesProvider,
      { harvestableNames: ['Barren Perimeter Reservoir'] },
      null,
    ),
  );
  expect(refresh.calls.at(-1)).toEqual({ typeIds: [], enabled: false, refreshKey: '' });

  refresh.isPending = (typeId) => typeId === 30370;
  const pendingHtml = render(
    [barrenLive],
    createElement(
      ScannerLivePricesProvider,
      { harvestableNames: ['Barren Perimeter Reservoir'] },
      createElement(ScannerEstIskCell, {
        siteName: 'Barren Perimeter Reservoir',
        live: true,
      }),
    ),
  );
  expect(pendingHtml).toContain('data-price-state="pending"');
  expect(pendingHtml).toContain('data-signature-isk="value"');
  expect(pendingHtml).toContain('28.1M');

  refresh.isPending = () => false;
  refresh.prices = new Map([[30370, { bestSell: 25_000 }]]);
  const settledHtml = render(
    [barrenLive],
    createElement(
      ScannerLivePricesProvider,
      { harvestableNames: ['Barren Perimeter Reservoir'] },
      createElement(ScannerEstIskCell, {
        siteName: 'Barren Perimeter Reservoir',
        live: true,
      }),
    ),
  );
  expect(settledHtml).toContain('data-price-state="settled"');
  expect(settledHtml).toContain('25.0M');

  const combatHtml = render(
    [siteSearchEntry({ id: 1, name: 'Sansha Hideout', blueLootIsk: 12_000_000 })],
    createElement(
      ScannerLivePricesProvider,
      { harvestableNames: [] },
      createElement(ScannerEstIskCell, {
        siteName: 'Sansha Hideout',
        live: false,
      }),
    ),
  );
  expect(combatHtml).toContain('data-signature-isk="value"');
  expect(combatHtml).toContain('12.0M');
  expect(combatHtml).not.toContain('data-price-state');
});
