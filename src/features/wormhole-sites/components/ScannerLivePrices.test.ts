import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setSiteNameIndex } from '../site-name-lookup';
import {
  ScannerEstIskCell,
  ScannerLivePricesProvider,
} from './ScannerLivePrices';

const refresh = vi.hoisted(() => ({
  calls: [] as { typeIds: number[]; enabled: boolean }[],
  isPending: (_typeId: number) => false as boolean,
  prices: new Map<number, { pct5Buy: number | null }>(),
}));

vi.mock('@/data/market-prices/use-refresh-on-view', () => ({
  useRefreshOnView: (typeIds: number[], opts: { enabled: boolean }) => {
    refresh.calls.push({ typeIds: [...typeIds], enabled: opts.enabled });
    return {
      prices: refresh.prices,
      isPending: (typeId: number) => refresh.isPending(typeId),
      refreshing: opts.enabled,
    };
  },
}));

afterEach(() => {
  setSiteNameIndex([]);
  refresh.calls = [];
  refresh.isPending = () => false;
  refresh.prices = new Map();
});

function render(node: ReactNode): string {
  return renderToStaticMarkup(createElement('div', null, node));
}

describe('ScannerLivePricesProvider', () => {
  it('enables refresh when harvestable catalogue rows carry live recipes', () => {
    setSiteNameIndex([
      {
        id: 49,
        name: 'Barren Perimeter Reservoir',
        estIsk: 28_100_000,
        liveRecipes: [{ typeId: 30370, units: 1_000, seedIsk: 28_100_000 }],
      },
    ]);

    render(
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
    });
  });

  it('stays disabled when harvestable names have no live recipes', () => {
    setSiteNameIndex([
      { id: 49, name: 'Barren Perimeter Reservoir', estIsk: 28_100_000 },
    ]);

    render(
      createElement(
        ScannerLivePricesProvider,
        { harvestableNames: ['Barren Perimeter Reservoir'] },
        null,
      ),
    );

    expect(refresh.calls.at(-1)).toEqual({ typeIds: [], enabled: false });
  });
});

describe('ScannerEstIskCell', () => {
  it('renders LivePrice pending→settled for harvestable recipes', () => {
    setSiteNameIndex([
      {
        id: 49,
        name: 'Barren Perimeter Reservoir',
        estIsk: 28_100_000,
        liveRecipes: [{ typeId: 30370, units: 1_000, seedIsk: 28_100_000 }],
      },
    ]);
    refresh.isPending = (typeId) => typeId === 30370;

    const pendingHtml = render(
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
    refresh.prices = new Map([[30370, { pct5Buy: 25_000 }]]);
    const settledHtml = render(
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
  });

  it('keeps combat Est. ISK static without a LivePrice pending pulse', () => {
    setSiteNameIndex([
      { id: 1, name: 'Sansha Hideout', estIsk: 12_000_000 },
    ]);

    const html = render(
      createElement(
        ScannerLivePricesProvider,
        { harvestableNames: [] },
        createElement(ScannerEstIskCell, {
          siteName: 'Sansha Hideout',
          live: false,
        }),
      ),
    );
    expect(html).toContain('data-signature-isk="value"');
    expect(html).toContain('12.0M');
    expect(html).not.toContain('data-price-state');
  });
});
