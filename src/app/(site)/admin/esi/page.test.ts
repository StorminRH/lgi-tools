import type { ReactNode } from 'react';
import { prerender } from 'react-dom/static';
import { expect, onTestFinished, test, vi } from 'vitest';
import { silenceConsolePrefixes } from '@/lib/__tests__/console-tags';
import { adminSessionFixture } from '@/composition/__tests__/session-fixture';

const m = vi.hoisted(() => ({
  budget: vi.fn(),
  outcomeStats: vi.fn(),
  priceRefreshDays: vi.fn(),
  degradation: vi.fn(),
  clientErrors: vi.fn(),
  priceSplit: vi.fn(),
  historySplit: vi.fn(),
  writeBehind: vi.fn(),
  endpoints: vi.fn(),
}));

vi.mock('@/composition/route-guards', () => ({ requireAdminPage: async () => adminSessionFixture() }));
vi.mock('next/navigation', () => ({
  unstable_rethrow: () => undefined,
  usePathname: () => '/admin/esi',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/platform/esi/scoreboard', () => ({ readEsiBudgetSnapshot: m.budget }));
vi.mock('../shared-reads', () => ({
  getCapabilityOutcomeStatsShared: m.outcomeStats,
  getPriceRefreshDaysShared: m.priceRefreshDays,
  getPriceSourceDegradationShared: m.degradation,
  getEsiClientErrorsShared: m.clientErrors,
}));
vi.mock('@/data/telemetry/queries', () => ({
  getPriceSourceSplit: m.priceSplit,
  getHistorySourceSplit: m.historySplit,
  getWriteBehindOutcomes: m.writeBehind,
  getTopCostlyEndpoints: m.endpoints,
}));

import AdminEsiPage from './page';

async function render(element: ReactNode): Promise<string> {
  const { prelude } = await prerender(element, { onError: () => undefined });
  return new Response(prelude).text();
}

function page(): Promise<string> {
  return render(AdminEsiPage({ searchParams: Promise.resolve({ range: '7d' }) }));
}

function stubReads() {
  m.budget.mockResolvedValue({ effectiveRemaining: 12, selfCount: 88, echo: 14, source: 'shared' });
  m.outcomeStats.mockResolvedValue([]);
  m.priceRefreshDays.mockResolvedValue([]);
  m.degradation.mockResolvedValue({ budgetExhaustions: 1, byCaller: [] });
  m.clientErrors.mockResolvedValue([
    { feature: 'maps', operation: 'search-characters', errors: 3, calls: 60, lastSeen: new Date('2026-09-20T00:00:00Z') },
  ]);
  m.priceSplit.mockResolvedValue({ requested: 1_200, returned: 9, esiCount: 6, fuzzworkFallbackCount: 1 });
  m.historySplit.mockResolvedValue({ freshEsi: 2, warmStored: 5, staleStored: 1, missing: 1 });
  m.writeBehind.mockResolvedValue([]);
  m.endpoints.mockResolvedValue([]);
}

test('admin ESI fills each titled card from its reads and says why empty blocks are empty', async () => {
  stubReads();

  const html = await page();

  for (const [name, title] of [
    ['budget', 'Error budget'],
    ['pressure', 'Rate-limit pressure'],
    ['price-sources', 'Scheduled price sources'],
    ['on-demand', 'On-demand prices &amp; history'],
    ['endpoints', 'Busiest owned-data endpoints'],
  ]) {
    expect(html).toContain(`data-admin-card="${name}"`);
    expect(html).toContain(`>${title}</h3>`);
  }

  // The budget sits below the floor: red headline, paused dispatch, the readings behind it.
  expect(html).toContain('text-tone-red">12</span>');
  expect(html).toContain('floor 20 · dispatch paused');
  expect(html).toContain('>Observed HTTP errors</span>');

  // Plain figures carry no verdict and stay in the default colour.
  const value = (label: string) =>
    html.match(new RegExp(`>${label}</span>(?:<span[^>]*>[^<]*</span>)?</span><span class="([^"]*)">([^<]*)</span>`));
  expect(value('Item prices requested')?.[2]).toBe('1,200');
  expect(value('Item prices requested')?.[1]).toContain('text-name');
  expect(value('Scoreboard source')?.[1]).toContain('text-name');
  // The pressure lines keep their verdicts.
  expect(html).toContain('<span class="sr-only">Warning</span>');
  expect(html).toContain('ESI 4xx answers');
  expect(html).toContain('3 of 60 calls · most from maps · search-characters');

  expect(html).toContain('No price refreshes in this range.');
  expect(html).toContain('No degraded price reads in this range.');
  expect(html).toContain('No owned-data reads in this range.');
});

test('admin ESI blanks only the card whose read failed', async () => {
  stubReads();
  const error = silenceConsolePrefixes('error', ['[admin] endpoints section unavailable']);
  onTestFinished(() => {
    error.mockRestore();
  });
  m.endpoints.mockRejectedValue(new Error('offline'));

  const html = await page();

  expect(html.match(/Unable to load this section\./g)).toHaveLength(1);
  expect(html).toContain('>Item prices requested</span>');
});
