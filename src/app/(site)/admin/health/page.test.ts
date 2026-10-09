import type { ReactNode } from 'react';
import { prerender } from 'react-dom/static';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  lastCronRuns: vi.fn(),
  cronOutcomes: vi.fn(),
  priceRefreshDays: vi.fn(),
  outcomeStats: vi.fn(),
  latency: vi.fn(),
  queue: vi.fn(),
  deadLetters: vi.fn(),
  events: vi.fn(),
}));

vi.mock('@/composition/route-guards', () => ({ requireAdminPage: async () => ({ isAdmin: true }) }));
vi.mock('next/navigation', () => ({
  unstable_rethrow: () => undefined,
  usePathname: () => '/admin/health',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('../shared-reads', () => ({
  getLastCronRunsShared: m.lastCronRuns,
  getCronOutcomesShared: m.cronOutcomes,
  getLastSyncedAtShared: async () => null,
  getPriceRefreshDaysShared: m.priceRefreshDays,
  getCapabilityOutcomeStatsShared: m.outcomeStats,
  getCapabilityLatencyShared: m.latency,
  getEsiRefreshQueueStatsShared: m.queue,
}));
vi.mock('@/data/esi-refresh-jobs/queries', () => ({ listDeadLetteredJobs: m.deadLetters }));
vi.mock('@/data/domain-events/queries', () => ({ listRecentDomainEvents: m.events }));

import AdminHealthPage from './page';

const NOW = Date.now();
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000);

async function render(element: ReactNode): Promise<string> {
  const { prelude } = await prerender(element, { onError: () => undefined });
  return new Response(prelude).text();
}

function page(): Promise<string> {
  return render(AdminHealthPage({ searchParams: Promise.resolve({ range: '7d' }) }));
}

describe('admin health', () => {
  beforeEach(() => {
    vi.stubEnv('GSC_SITE_URL', '');
    m.lastCronRuns.mockResolvedValue([
      { action: 'cron_prices', timestamp: hoursAgo(3), outcome: 'refreshed' },
      { action: 'cron_sde', timestamp: hoursAgo(5), outcome: 'remote-unreachable' },
    ]);
    m.cronOutcomes.mockResolvedValue({
      cron_prices: [{ outcome: 'refreshed', count: 7, avgDurationMs: 900 }],
      cron_sde: [],
      cron_gsc: [],
      cron_housekeeping: [],
    });
    m.priceRefreshDays.mockResolvedValue([]);
    m.outcomeStats.mockResolvedValue([]);
    m.latency.mockResolvedValue({ p95: 420, slowest: [] });
    m.queue.mockResolvedValue([]);
    m.deadLetters.mockResolvedValue([]);
    m.events.mockResolvedValue([
      {
        id: 1,
        occurredAt: new Date('2026-09-20T18:04:00Z'),
        eventType: 'esi_budget_guard_exhausted',
        metadata: { count: 3, windowMinutes: 15, windowStartedAt: '', windowEndedAt: '' },
      },
    ]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('renders each card through one titled section, scheduled tasks at #scheduled', async () => {
    const html = await page();

    for (const [name, title] of [
      ['service-levels', 'Service levels'],
      ['scheduled-tasks', 'Scheduled tasks'],
      ['event-log', 'Event log'],
    ]) {
      expect(html).toContain(`data-admin-card="${name}"`);
      expect(html).toContain(`>${title}</h3>`);
    }
    expect(html).toMatch(/data-admin-card="scheduled-tasks" id="scheduled"/);
    expect(m.events).toHaveBeenCalledWith(30);
    expect(html).toContain('2026-09-20 18:04');
    expect(html).toContain('Public ESI budget exhausted 3 times in 15m');
  });

  it('reads scheduled tasks like the overview’s Jobs card', async () => {
    const html = await page();

    expect(html).not.toContain('w-[110px]');
    expect(html).toMatch(/text-text wrap-break-word">SDE cron<\/span><span class="block font-data[^"]*">remote-unreachable 5h ago<\/span>/);
    expect(html).toContain('text-tone-red">failing</span>');
    expect(html).toContain('<span class="sr-only">Critical</span>');
    expect(html).toContain('aria-label="Price cron runs: 7 refreshed"');
    expect(html).not.toMatch(/<span data-chevron(?![^>]*aria-hidden="true")/);
  });

  it('says why a detail is empty, inset in its body', async () => {
    const html = await page();

    // Glyph tones: faint inbox for no data, green check for all clear, info for not connected.
    const emptyState = (text: string) =>
      new RegExp(
        `<div class="flex items-center gap-3 font-ui text-ui text-muted"><svg[^>]*class="shrink-0 ([^"]+)"[^>]*>(?:(?!</svg>).)*</svg><div class="min-w-0">${text}</div></div>`,
      );
    expect(html).toMatch(emptyState('No price refreshes recorded this period\\.'));
    expect(html).toMatch(emptyState('No runs in this period\\.'));
    expect(html.match(emptyState('Search Console not connected\\.'))?.[1]).toBe('text-muted');
    expect(html.match(emptyState('No failures in this period\\.'))?.[1]).toBe('text-isk');
    expect(html.match(emptyState('No dead-lettered jobs\\.'))?.[1]).toBe('text-isk');
    expect(html.match(emptyState('No operations in this period\\.'))?.[1]).toBe('text-faint');
  });

  it('marks only the failed detail of a service level unavailable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    m.deadLetters.mockRejectedValue(new Error('offline'));

    const html = await page();

    expect(html).toMatch(/text-tone-orange"[^>]*>(?:(?!<\/svg>).)*<\/svg><div class="min-w-0">Details unavailable\.<\/div>/);
    expect(html).not.toContain('Unable to load this section.');
  });

  it('blanks only the card whose read failed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    m.events.mockRejectedValue(new Error('offline'));

    const html = await page();

    expect(html.match(/Unable to load this section\./g)).toHaveLength(1);
    expect(html).toContain('>Price cron</span>');
  });
});
