import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const order: string[] = [];
  const workByName = new Map<string, () => Promise<void>>();
  const declaration = (name: string) => ({
    name,
    action: 'cron_prices',
    capability: 'cron.refresh-prices',
    wakeClass: 'batch',
    record: { policy: 'noteworthy' },
    lock: { mode: 'none', justification: 'test step is lock-free' },
    work: async () => {
      order.push(name);
      await workByName.get(name)?.();
      return { outcome: 'idle', workDone: false, body: {} };
    },
  });
  return { order, workByName, declaration, logUsageEvent: vi.fn() };
});

vi.mock('../housekeeping/declaration', () => ({ housekeepingDeclaration: h.declaration('cron:housekeeping') }));
vi.mock('../purge-maps/declaration', () => ({ purgeMapsDeclaration: h.declaration('cron:purge-maps') }));
vi.mock('../refresh-prices/declaration', () => ({ refreshPricesDeclaration: h.declaration('cron:prices') }));
vi.mock('../refresh-industry-indices/declaration', () => ({
  refreshIndustryIndicesDeclaration: h.declaration('cron:industry-indices'),
}));
vi.mock('../drain-esi-refresh-jobs/declaration', () => ({
  drainEsiRefreshJobsDeclaration: h.declaration('cron:esi-refresh-jobs'),
}));
vi.mock('../revalue-net-worth/declaration', () => ({ revalueNetWorthDeclaration: h.declaration('cron:net-worth') }));
vi.mock('../refresh-wh-statics/declaration', () => ({ refreshWhStaticsDeclaration: h.declaration('cron:wh-statics') }));
vi.mock('@/db', () => ({ directClient: {} }));
vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: (...args: unknown[]) => h.logUsageEvent(...args),
}));
vi.mock('next/server', () => ({
  after: (fn: () => unknown) => fn(),
  connection: vi.fn().mockResolvedValue(undefined),
}));

import { cronRequest, TEST_CRON_SECRET } from '@/lib/__tests__/route-requests';
import { GET } from './route';
import { purgeEligibleMaps } from '@/composition/map-purge';

const ROUTE = '/api/cron/daily-batch';

describe('GET /api/cron/daily-batch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('CRON_SECRET', TEST_CRON_SECRET);
    h.order.length = 0;
    h.workByName.clear();
    h.logUsageEvent.mockReset().mockResolvedValue(undefined);
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('drains the refresh queue and revalues net worth after the price sweeps, wormhole statics only on Mondays and housekeeping last', async () => {
    vi.setSystemTime(new Date('2026-09-28T12:20:00Z'));
    expect((await GET(cronRequest(ROUTE))).status).toBe(200);
    expect(h.order).toEqual(['cron:purge-maps', 'cron:prices', 'cron:industry-indices', 'cron:esi-refresh-jobs', 'cron:net-worth', 'cron:wh-statics', 'cron:housekeeping']);

    h.order.length = 0;
    vi.setSystemTime(new Date('2026-09-29T12:20:00Z'));
    const response = await GET(cronRequest(ROUTE));
    expect(h.order).toEqual(['cron:purge-maps', 'cron:prices', 'cron:industry-indices', 'cron:esi-refresh-jobs', 'cron:net-worth', 'cron:housekeeping']);
    await expect(response.json()).resolves.toMatchObject({
      steps: expect.arrayContaining([{ name: 'cron:wh-statics', status: 'skipped' }]),
    });
  });

  it('skips the net-worth revalue when the price sweep fails', async () => {
    vi.setSystemTime(new Date('2026-09-29T12:20:00Z'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    h.workByName.set('cron:prices', async () => { throw new Error('prices down'); });

    const response = await GET(cronRequest(ROUTE));

    expect(h.order).toEqual(['cron:purge-maps', 'cron:prices', 'cron:industry-indices', 'cron:esi-refresh-jobs', 'cron:housekeeping']);
    await expect(response.json()).resolves.toMatchObject({
      steps: expect.arrayContaining([
        { name: 'cron:prices', status: 'failed' },
        { name: 'cron:net-worth', status: 'skipped' },
      ]),
    });
  });

  it('starts later jobs within the invocation window after a slow purge backlog', async () => {
    vi.setSystemTime(new Date('2026-09-28T12:20:00Z'));
    const started = Date.now();
    let pricesStartedAt: number | null = null;
    const tombstoned: string[] = [];
    h.workByName.set('cron:purge-maps', async () => {
      await purgeEligibleMaps({
        claimMaps: async () => Array.from({ length: 25 }, (_, i) => ({ id: `map-${i}` })),
        purgeChain: async () => {
          vi.advanceTimersByTime(6_000);
          return { deleted: 1, remaining: false };
        },
        teardownAccess: async () => {
          vi.advanceTimersByTime(6_000);
          return { inserted: 0, updated: 0, deleted: 0, unchanged: 0, outcome: 'applied' };
        },
        tombstoneMap: async (mapId) => {
          tombstoned.push(mapId);
          return true;
        },
      });
    });
    h.workByName.set('cron:prices', async () => { pricesStartedAt = Date.now(); });

    const response = await GET(cronRequest(ROUTE));

    expect(response.status).toBe(200);
    expect(tombstoned).toEqual(['map-0', 'map-1', 'map-2', 'map-3', 'map-4']);
    expect(pricesStartedAt).toBe(started + 60_000);
    expect(h.order).toEqual(['cron:purge-maps', 'cron:prices', 'cron:industry-indices', 'cron:esi-refresh-jobs', 'cron:net-worth', 'cron:wh-statics', 'cron:housekeeping']);
    await expect(response.json()).resolves.toEqual({ steps: [
      { name: 'cron:purge-maps', status: 'ok' },
      { name: 'cron:prices', status: 'ok' },
      { name: 'cron:industry-indices', status: 'ok' },
      { name: 'cron:esi-refresh-jobs', status: 'ok' },
      { name: 'cron:net-worth', status: 'ok' },
      { name: 'cron:wh-statics', status: 'ok' },
      { name: 'cron:housekeeping', status: 'ok' },
    ] });
  });
});
