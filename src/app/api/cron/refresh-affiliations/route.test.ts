import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const listStaleLinkedCharacterIdsMock = vi.fn();
const refreshAffiliationsMock = vi.fn();
const logUsageEventMock = vi.fn();

let lockGot = true;
const reservedTag = Object.assign(
  vi.fn(() => Promise.resolve([{ got: lockGot }])),
  { release: vi.fn() },
);
const reserveMock = vi.fn((..._args: unknown[]) => Promise.resolve(reservedTag));

vi.mock('@/features/auth/affiliation', () => ({
  ADVISORY_LOCK_AFFILIATION_REFRESH: 31,
  refreshAffiliations: (...args: unknown[]) => refreshAffiliationsMock(...args),
}));

vi.mock('@/features/auth/affiliation-store', () => ({
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
    reserveMock.mockClear();
    reservedTag.mockClear();
    lockGot = true;
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

  it('returns busy and records the contention metadata', async () => {
    lockGot = false;
    const { GET } = await importRoute();
    const response = await GET(authedRequest());

    expect(await response.json()).toEqual({ status: 'busy' });
    expect(refreshAffiliationsMock).not.toHaveBeenCalled();
    expect(logUsageEventMock).toHaveBeenCalledWith({
      action: 'cron_affiliations',
      metadata: {
        outcome: 'busy',
        durationMs: expect.any(Number),
      },
    });
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
        stale: 3,
        refreshed: 2,
        durationMs: expect.any(Number),
      },
    });
  });
});
