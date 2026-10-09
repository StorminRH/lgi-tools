import type { ReactNode } from 'react';
import { prerender } from 'react-dom/static';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { silenceConsolePrefixes } from '@/lib/__tests__/console-tags';
import { adminSessionFixture } from '@/composition/__tests__/session-fixture';

const m = vi.hoisted(() => ({
  budget: vi.fn(),
  outcomeStats: vi.fn(),
  queue: vi.fn(),
  priceRefreshDays: vi.fn(),
  degradation: vi.fn(),
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
  getEsiRefreshQueueStatsShared: m.queue,
  getPriceRefreshDaysShared: m.priceRefreshDays,
  getPriceSourceDegradationShared: m.degradation,
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

describe('admin ESI', () => {
  beforeEach(() => {
    m.budget.mockResolvedValue({ effectiveRemaining: 12, selfCount: 88, echo: 14, source: 'shared' });
    m.outcomeStats.mockResolvedValue([]);
    m.queue.mockResolvedValue([]);
    m.priceRefreshDays.mockResolvedValue([]);
    m.degradation.mockResolvedValue({ budgetExhaustions: 1, byCaller: [] });
    m.priceSplit.mockResolvedValue({ requested: 1_200, returned: 9, cacheHits: 2, esiCount: 6, fuzzworkFallbackCount: 1 });
    m.historySplit.mockResolvedValue({ freshEsi: 2, warmStored: 5, staleStored: 1, missing: 1 });
    m.writeBehind.mockResolvedValue([]);
    m.endpoints.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('gives each card the title its skeleton, header and failure share', async () => {
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
    expect(html).not.toContain('Price-source health');
    expect(html).not.toContain('ESI cost');
    expect(m.endpoints).toHaveBeenCalledWith(expect.anything(), 8);
  });

  it('reads the budget once, below the floor, with its figures selected by name', async () => {
    const html = await page();

    expect(html).toContain('text-tone-red">12</span>');
    expect(html).toContain('floor 20 · dispatch paused');
    expect(html).toContain('>Observed HTTP errors</span>');
    expect(html).not.toContain('Effective remaining');
  });

  it('draws plain figures without a verdict, all in the default colour', async () => {
    const html = await page();

    const value = (label: string) =>
      html.match(new RegExp(`>${label}</span>(?:<span[^>]*>[^<]*</span>)?</span><span class="([^"]*)">([^<]*)</span>`));
    expect(value('Item prices requested')?.slice(1)).toEqual([
      'max-w-2/3 text-right font-data text-ui tabular-nums wrap-anywhere text-name',
      '1,200',
    ]);
    expect(value('Scoreboard source')?.[1]).toContain('text-name');
    // The pressure lines keep their verdicts.
    expect(html).toContain('<span class="sr-only">Warning</span>');
  });

  it('says why each empty block is empty', async () => {
    const html = await page();

    expect(html).toContain('No price refreshes in this range.');
    expect(html).toContain('No degraded price reads in this range.');
    expect(html).toContain('No owned-data reads in this range.');
  });

  it('blanks only the card whose read failed', async () => {
    silenceConsolePrefixes('error', ['[admin] endpoints section unavailable']);
    m.endpoints.mockRejectedValue(new Error('offline'));

    const html = await page();

    expect(html.match(/Unable to load this section\./g)).toHaveLength(1);
    expect(html).toContain('>Item prices requested</span>');
  });
});
