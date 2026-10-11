import { afterEach, expect, test, vi } from 'vitest';
import type { DateRange } from '@/data/telemetry/types';
import { silenceConsolePrefixes } from '@/lib/__tests__/console-tags';

const m = vi.hoisted(() => ({
  lastCronRuns: vi.fn(),
  cronOutcomes: vi.fn(),
  lastSyncedAt: vi.fn(),
  outcomeStats: vi.fn(),
  latency: vi.fn(),
}));

vi.mock('next/navigation', () => ({ unstable_rethrow: () => undefined }));
vi.mock('./shared-reads', () => ({
  getLastCronRunsShared: m.lastCronRuns,
  getCronOutcomesShared: m.cronOutcomes,
  getLastSyncedAtShared: m.lastSyncedAt,
  getCapabilityOutcomeStatsShared: m.outcomeStats,
  getCapabilityLatencyShared: m.latency,
}));

import { SECTION_LOAD_FAILED } from './load-section';
import { loadCronSignals, loadSliReads } from './load-signals';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  for (const fn of Object.values(m)) fn.mockReset();
});

const RANGE: DateRange = { from: new Date('2026-09-20T00:00:00Z'), to: new Date('2026-09-27T00:00:00Z') };
const PRICE_RUNS = [{ outcome: 'refreshed', count: 7, avgDurationMs: 900 }];
const GSC_RUNS = [{ outcome: 'synced', count: 1, avgDurationMs: 4_000 }];
const SYNCED_AT = new Date('2026-09-26T06:00:00Z');

test('reads the Search Console sync time only when Search Console is configured', async () => {
  m.lastCronRuns.mockResolvedValue([]);
  m.cronOutcomes.mockResolvedValue({ cron_prices: PRICE_RUNS, cron_sde: [], cron_gsc: GSC_RUNS, cron_housekeeping: [] });
  m.lastSyncedAt.mockResolvedValue(SYNCED_AT);
  vi.stubEnv('GSC_SITE_URL', '');

  const unconfigured = await loadCronSignals(RANGE);

  expect(m.cronOutcomes).toHaveBeenCalledWith(RANGE);
  expect(m.lastSyncedAt).not.toHaveBeenCalled();
  expect(unconfigured).toEqual({
    lastRuns: [],
    priceOutcomes: PRICE_RUNS,
    sdeOutcomes: [],
    gscOutcomes: GSC_RUNS,
    housekeepingOutcomes: [],
    gscConfigured: false,
    gscLastSyncedAt: null,
  });

  vi.stubEnv('GSC_SERVICE_ACCOUNT_JSON', '{}');
  vi.stubEnv('GSC_SITE_URL', 'sc-domain:lgi.tools');

  const configured = await loadCronSignals(RANGE);

  expect(m.lastSyncedAt).toHaveBeenCalledTimes(1);
  expect(configured).toMatchObject({ gscConfigured: true, gscLastSyncedAt: SYNCED_AT });
});

test('fails the cron bundle as a whole when one read fails, for its section to catch', async () => {
  m.lastCronRuns.mockResolvedValue([]);
  m.cronOutcomes.mockRejectedValue(new Error('db down'));
  vi.stubEnv('GSC_SITE_URL', '');

  await expect(loadCronSignals(RANGE)).rejects.toThrow('db down');
});

test('marks only the capability read that failed', async () => {
  const error = silenceConsolePrefixes('error', ['[admin] capability-latency section unavailable']);
  m.outcomeStats.mockResolvedValue([]);
  m.latency.mockRejectedValue(new Error('offline'));

  expect(await loadSliReads(RANGE)).toEqual({ outcomes: [], latency: SECTION_LOAD_FAILED });
  expect(m.outcomeStats).toHaveBeenCalledWith(RANGE);
  expect(error).toHaveBeenCalledWith('[admin] capability-latency section unavailable', expect.any(Error));
});
