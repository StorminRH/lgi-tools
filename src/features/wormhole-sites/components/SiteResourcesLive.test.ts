import { createElement, Fragment, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { siteResource } from '../__tests__/site-fixtures';
import { SiteHeaderTotal, SiteLiveProvider, SiteResourcesLive } from './SiteResourcesLive';

const refresh = vi.hoisted(() => ({
  calls: [] as { typeIds: number[]; enabled: boolean }[],
  pending: new Set<number>(),
  prices: new Map<number, { bestSell: number | null }>(),
}));

vi.mock('@/data/market-prices/use-refresh-on-view', () => ({
  useRefreshOnView: (typeIds: number[], opts: { enabled: boolean }) => {
    refresh.calls.push({ typeIds: [...typeIds], enabled: opts.enabled });
    return {
      prices: refresh.prices,
      isPending: (typeId: number) => refresh.pending.has(typeId),
      refreshing: false,
    };
  },
}));

const resources = [
  siteResource({ id: 1, typeId: 30370, units: 1_000, liveEligible: true, effectiveIsk: 20_000_000 }),
  siteResource({ id: 2, typeId: 30370, units: 500, liveEligible: true, effectiveIsk: 10_000_000 }),
  siteResource({ id: 3, typeId: 30371, units: 0, liveEligible: true, effectiveIsk: 1_000_000 }),
  siteResource({ id: 4, typeId: 30372, units: 100, liveEligible: false, effectiveIsk: 2_000_000 }),
  siteResource({ id: 5, typeId: null, effectiveIsk: null }),
];

const provider: ComponentProps<typeof SiteLiveProvider> = {
  resources,
  children: createElement(
    Fragment,
    null,
    createElement(SiteHeaderTotal, { resources }),
    createElement(SiteResourcesLive, { resources, siteType: 'gas', footerLabel: 'Total' }),
  ),
};

const render = () => renderToStaticMarkup(createElement(SiteLiveProvider, provider));

const count = (html: string, needle: string) => html.split(needle).length - 1;

test('site live prices request only live-priced type ids and gate pending on them', () => {
  const seeded = render();
  expect(refresh.calls).toEqual([{ typeIds: [30370], enabled: false }]);
  expect(count(seeded, 'data-price-state="settled"')).toBe(4);
  expect(seeded).toContain('20.0M');
  expect(seeded).toContain('<span class="font-data">1.0M</span>');
  expect(seeded).toContain('<span class="font-data">2.0M</span>');
  expect(count(seeded, '33.0M ISK')).toBe(2);

  // A refresh pending for a resource that is not live-priced leaves the totals settled.
  refresh.pending = new Set([30372]);
  const strayPending = render();
  expect(count(strayPending, 'data-price-state="pending"')).toBe(0);
  expect(count(strayPending, 'data-price-state="settled"')).toBe(4);

  refresh.pending = new Set([30370]);
  const pending = render();
  expect(count(pending, 'data-price-state="pending"')).toBe(4);
  expect(pending).toContain('20.0M');
  expect(pending).toContain('10.0M');

  refresh.pending = new Set();
  refresh.prices = new Map([[30370, { bestSell: 25_000 }]]);
  const settled = render();
  expect(count(settled, 'data-price-state="settled"')).toBe(4);
  expect(settled).toContain('25.0M');
  expect(settled).toContain('12.5M');
  expect(count(settled, '40.5M ISK')).toBe(2);
});
