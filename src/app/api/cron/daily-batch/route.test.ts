import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const order: string[] = [];
  const declaration = (name: string) => ({
    name,
    action: 'cron_prices',
    capability: 'cron.refresh-prices',
    wakeClass: 'batch',
    record: { policy: 'noteworthy' },
    lock: { mode: 'none', justification: 'test step is lock-free' },
    work: async () => {
      order.push(name);
      return { outcome: 'idle', workDone: false, body: {} };
    },
  });
  return { order, declaration, logUsageEvent: vi.fn() };
});

vi.mock('../purge-maps/declaration', () => ({ purgeMapsDeclaration: h.declaration('cron:purge-maps') }));
vi.mock('../refresh-prices/declaration', () => ({ refreshPricesDeclaration: h.declaration('cron:prices') }));
vi.mock('../refresh-industry-indices/declaration', () => ({
  refreshIndustryIndicesDeclaration: h.declaration('cron:industry-indices'),
}));
vi.mock('../refresh-wh-statics/declaration', () => ({ refreshWhStaticsDeclaration: h.declaration('cron:wh-statics') }));
vi.mock('@/db', () => ({ directClient: {} }));
vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: (...args: unknown[]) => h.logUsageEvent(...args),
}));
vi.mock('next/server', () => ({
  after: (fn: () => unknown) => fn(),
  connection: vi.fn().mockResolvedValue(undefined),
}));

import { GET } from './route';

function authedRequest(): Request {
  return new Request('http://localhost:3000/api/cron/daily-batch', {
    headers: { authorization: 'Bearer cron-secret' },
  });
}

describe('GET /api/cron/daily-batch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    h.order.length = 0;
    h.logUsageEvent.mockReset().mockResolvedValue(undefined);
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('runs the wormhole statics step last, and only on Mondays', async () => {
    vi.setSystemTime(new Date('2026-09-28T12:20:00Z'));
    expect((await GET(authedRequest())).status).toBe(200);
    expect(h.order).toEqual(['cron:purge-maps', 'cron:prices', 'cron:industry-indices', 'cron:wh-statics']);

    h.order.length = 0;
    vi.setSystemTime(new Date('2026-09-29T12:20:00Z'));
    const response = await GET(authedRequest());
    expect(h.order).toEqual(['cron:purge-maps', 'cron:prices', 'cron:industry-indices']);
    await expect(response.json()).resolves.toMatchObject({
      steps: expect.arrayContaining([{ name: 'cron:wh-statics', status: 'skipped' }]),
    });
  });
});
