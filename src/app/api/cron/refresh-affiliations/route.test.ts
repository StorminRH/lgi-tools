import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const listStaleLinkedCharacterIdsMock = vi.fn();
const refreshAffiliationsMock = vi.fn();
const logUsageEventMock = vi.fn();

const reconcileAffiliationAccessMock = vi.fn();
const reserveMock = vi.fn();

vi.mock('@/platform/auth/affiliation', () => ({
  refreshAffiliations: (...args: unknown[]) => refreshAffiliationsMock(...args),
}));

vi.mock('@/composition/map-affiliation-access', () => ({ reconcileAffiliationAccess: reconcileAffiliationAccessMock }));

vi.mock('@/platform/auth/affiliation-store', () => ({
  listStaleLinkedCharacterIds: (...args: unknown[]) =>
    listStaleLinkedCharacterIdsMock(...args),
}));

vi.mock('@/data/telemetry/queries', () => ({
  logUsageEvent: (input: unknown) => logUsageEventMock(input),
}));

vi.mock('@/db', () => ({
  directClient: { reserve: (...args: unknown[]) => reserveMock(...args) },
}));

vi.mock('next/server', () => ({ connection: () => Promise.resolve() }));

async function importRoute() {
  return await import('./route');
}

function authedRequest(): Request {
  return new Request('http://localhost:3000/api/cron/refresh-affiliations', {
    headers: { authorization: 'Bearer test-secret' },
  });
}

describe('GET /api/cron/refresh-affiliations', () => {
  beforeEach(() => {
    vi.resetModules();
    listStaleLinkedCharacterIdsMock.mockReset();
    refreshAffiliationsMock.mockReset();
    logUsageEventMock.mockReset().mockResolvedValue(undefined);
    reconcileAffiliationAccessMock.mockReset().mockResolvedValue({ processed: 0, failed: 0 });
    reserveMock.mockClear();
    vi.stubEnv('CRON_SECRET', 'test-secret');
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('rejects a request without the cron bearer token', async () => {
    const { GET } = await importRoute();
    const response = await GET(
      new Request('http://localhost:3000/api/cron/refresh-affiliations'),
    );

    expect(response.status).toBe(401);
    expect(reserveMock).not.toHaveBeenCalled();
    expect(listStaleLinkedCharacterIdsMock).not.toHaveBeenCalled();
  });

  it('retries pending access changes even when affiliations are fresh, without reserving a connection', async () => {
    listStaleLinkedCharacterIdsMock.mockResolvedValue([]);
    refreshAffiliationsMock.mockResolvedValue(0);
    reconcileAffiliationAccessMock.mockResolvedValue({ processed: 2, failed: 0 });
    const { GET } = await importRoute();
    expect(await (await GET(authedRequest())).json()).toEqual({ status: 'refreshed', stale: 0, refreshed: 0 });
    expect(reconcileAffiliationAccessMock).toHaveBeenCalledOnce();
    expect(reserveMock).not.toHaveBeenCalled();
  });

  it('returns stale and refreshed counts and records them', async () => {
    listStaleLinkedCharacterIdsMock.mockResolvedValue([101, 202, 303]);
    refreshAffiliationsMock.mockResolvedValue(2);
    const { GET } = await importRoute();
    const response = await GET(authedRequest());

    expect(await response.json()).toEqual({
      status: 'refreshed',
      stale: 3,
      refreshed: 2,
    });
    expect(refreshAffiliationsMock).toHaveBeenCalledWith([101, 202, 303]);
    expect(logUsageEventMock).toHaveBeenCalledWith({
      action: 'cron_affiliations',
      metadata: {
        outcome: 'refreshed',
        access: { processed: 0, failed: 0 },
        stale: 3,
        refreshed: 2,
        durationMs: expect.any(Number),
      },
    });
  });
});
