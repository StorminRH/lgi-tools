import type { ReactNode } from 'react';
import { prerender } from 'react-dom/static';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { silenceConsolePrefixes } from '@/lib/__tests__/console-tags';
import { adminSessionFixture } from '@/composition/__tests__/session-fixture';
import type { AdminSignals } from './signals';

const m = vi.hoisted(() => ({
  loadAdminSignals: vi.fn(),
  getAccountTotals: vi.fn(),
  getSystemStatics: vi.fn(),
  getReturningVsNew: vi.fn(),
}));

vi.mock('@/composition/route-guards', () => ({ requireAdminPage: async () => adminSessionFixture() }));
vi.mock('next/navigation', () => ({
  unstable_rethrow: () => undefined,
  usePathname: () => '/admin',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('./load-signals', () => ({ loadAdminSignals: m.loadAdminSignals }));
vi.mock('@/platform/auth/admin-users', () => ({ getAccountTotals: m.getAccountTotals }));
vi.mock('@/data/wh-statics/queries', () => ({ getSystemStatics: m.getSystemStatics }));
vi.mock('@/data/telemetry/queries', () => ({ getReturningVsNew: m.getReturningVsNew }));
vi.mock('./deploy-markers', () => ({ loadDeployMarkers: async () => [] }));
vi.mock('./shared-reads', () => ({
  getStaticsSummaryShared: async () => null,
  getEsiRefreshQueueStatsShared: async () => [],
  getPageViewStatsShared: async () => ({ current: [], previous: [] }),
}));

import AdminOverviewPage from './page';

const NOW = new Date('2026-09-26T12:00:00Z');

const SIGNALS: AdminSignals = {
  now: NOW,
  crons: {
    lastRuns: [
      { action: 'cron_prices', timestamp: new Date('2026-09-26T09:00:00Z'), outcome: 'refreshed' },
      { action: 'cron_sde', timestamp: new Date('2026-09-26T07:00:00Z'), outcome: 'up-to-date' },
      { action: 'cron_housekeeping', timestamp: new Date('2026-09-26T08:00:00Z'), outcome: 'cleaned' },
    ],
    priceOutcomes: [],
    sdeOutcomes: [],
    gscOutcomes: [],
    housekeepingOutcomes: [],
    gscConfigured: false,
    gscLastSyncedAt: null,
  },
  budget: { effectiveRemaining: 87, selfCount: 2, echo: 90, source: 'shared' },
  fallback: { esi: 100, fallback: 0, perDay: [] },
  budgetExhaustions: 0,
  sli: { readSuccess: 0.999, mutationSuccess: 1, latencyP95: 420, esiSuccess: 0.99 },
  queue: [],
  statics: null,
  releases: [{ date: '2026-09-24', label: 'v4.1.3' }],
};

async function render(element: ReactNode): Promise<string> {
  const { prelude } = await prerender(element, { onError: () => undefined });
  return new Response(prelude).text();
}

function page(): Promise<string> {
  return render(AdminOverviewPage({ searchParams: Promise.resolve({ range: '7d' }) }));
}

describe('admin overview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('GSC_SITE_URL', '');
    m.loadAdminSignals.mockResolvedValue(SIGNALS);
    m.getAccountTotals.mockResolvedValue({ users: 12, characters: 30 });
    m.getSystemStatics.mockResolvedValue({ version: '7' });
    m.getReturningVsNew.mockResolvedValue({ current: { newUsers: 1, returning: 2 }, previous: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('renders every card through one titled section with its own hook', async () => {
    const html = await page();

    for (const [name, title] of [
      ['attention', 'Needs attention'],
      ['accounts', 'Registered users'],
      ['actions', 'Actions'],
      ['status-app', 'App'],
      ['status-esi', 'ESI'],
      ['status-jobs', 'Jobs'],
      ['audience', 'Audience'],
    ]) {
      expect(html).toContain(`data-admin-card="${name}"`);
      expect(html).toContain(`>${title}</h3>`);
    }
    expect(html).not.toMatch(/data-admin-(attention|status|actions|audience)[ =>]/);
  });

  it('fills each status card with its own group from the shared signals', async () => {
    const html = await page();

    expect(html).toContain('>Page &amp; tool reads</span>');
    expect(html).toContain('>87 left</span>');
    expect(html).toContain('>Price cron</span>');
    expect(html).toContain('<span class="sr-only">Healthy</span>');
    // Attention and the three status cards each ask for the signals by range
    // key; in the app React cache turns those four asks into one read.
    expect(m.loadAdminSignals.mock.calls).toEqual([['7d'], ['7d'], ['7d'], ['7d']]);
  });

  it('blanks only the card whose read failed', async () => {
    silenceConsolePrefixes('error', ['[admin] accounts section unavailable']);
    m.getAccountTotals.mockRejectedValue(new Error('offline'));

    const html = await page();

    expect(html).toContain('Unable to load this section.');
    expect(html.match(/Unable to load this section\./g)).toHaveLength(1);
    expect(html).toContain('All clear');
  });
});
