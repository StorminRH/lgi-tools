import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { silenceConsolePrefixes } from '@/lib/__tests__/console-tags';
import { createReservedConnectionMock } from '@/db/__tests__/support/reserved-connection-mock';
import { cronRequest, TEST_CRON_SECRET } from '@/lib/__tests__/route-requests';

const h = vi.hoisted(() => ({
  purgeEligibleMaps: vi.fn(),
  logUsageEvent: vi.fn(),
}));
const lock = createReservedConnectionMock();

vi.mock('@/composition/map-purge', () => ({
  purgeEligibleMaps: (...args: unknown[]) => h.purgeEligibleMaps(...args),
}));
vi.mock('@/db', () => ({
  directClient: { reserve: (...args: unknown[]) => lock.reserve(...args) },
}));
vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: (...args: unknown[]) => h.logUsageEvent(...args),
}));
vi.mock('next/server', () => ({
  after: (fn: () => unknown) => fn(),
  connection: vi.fn().mockResolvedValue(undefined),
}));

const ROUTE = '/api/cron/purge-maps';

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('CRON_SECRET', TEST_CRON_SECRET);
  h.purgeEligibleMaps.mockReset().mockResolvedValue({
    selected: 2,
    tombstoned: 1,
    deletedDocuments: 300,
    projectionPending: 0,
  });
  lock.reserve.mockClear();
  lock.reserved.mockClear();
  lock.reserved.release.mockClear();
  h.logUsageEvent.mockReset().mockResolvedValue(undefined);
  silenceConsolePrefixes('log', ['{"scope":"cron:']);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('GET /api/cron/purge-maps', () => {
  it('rejects a request without the cron bearer', async () => {
    const { GET } = await import('./route');
    expect((await GET(new Request('http://localhost:3000/api/cron/purge-maps'))).status).toBe(401);
    expect(h.purgeEligibleMaps).not.toHaveBeenCalled();
  });

  it('runs the bounded sweep under the shared cron shell', async () => {
    const { GET } = await import('./route');
    const response = await GET(cronRequest(ROUTE));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: 'purged',
      selected: 2,
      tombstoned: 1,
      deletedDocuments: 300,
      projectionPending: 0,
    });
    expect(h.purgeEligibleMaps).toHaveBeenCalledOnce();
    expect(h.logUsageEvent).toHaveBeenCalledWith({
      action: 'cron_map_purge',
      metadata: expect.objectContaining({
        outcome: 'purged',
        selected: 2,
        tombstoned: 1,
      }),
    });
  });
});
