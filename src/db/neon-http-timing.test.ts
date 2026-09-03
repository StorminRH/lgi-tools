import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DependencyKind } from '@/lib/dependency-timing';

const NEON_URL = 'postgres://u:p@ep-x-123456.us-east-2.aws.neon.tech/db?sslmode=require';

const { neonConfigMock, neonMock, fetchWithTimeoutMock } = vi.hoisted(() => ({
  neonConfigMock: {} as { fetchFunction?: (input: string, init?: RequestInit) => Promise<Response> },
  neonMock: vi.fn(() => ({})),
  fetchWithTimeoutMock: vi.fn(async () => new Response('ok')),
}));

vi.mock('@neondatabase/serverless', () => ({
  neon: neonMock,
  neonConfig: neonConfigMock,
}));
vi.mock('drizzle-orm/neon-http', () => ({ drizzle: vi.fn(() => ({})) }));
vi.mock('@/lib/fetch-with-timeout', () => ({ fetchWithTimeout: fetchWithTimeoutMock }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  delete neonConfigMock.fetchFunction;
  neonMock.mockClear();
  fetchWithTimeoutMock.mockClear();
});

async function installedFetchFunction() {
  vi.stubEnv('LOCAL_DB_DRIVER', '');
  vi.stubEnv('DATABASE_URL', NEON_URL);
  const recorded: Array<[DependencyKind, number]> = [];
  const { setDependencyTimingSink } = await import('@/lib/dependency-timing');
  setDependencyTimingSink((kind, ms) => {
    recorded.push([kind, ms]);
  });

  const { db } = await import('./index');
  void db.select;
  const fetchFunction = neonConfigMock.fetchFunction;
  if (!fetchFunction) throw new Error('neonConfig.fetchFunction was not installed');
  return { fetchFunction, recorded };
}

describe('neon-http dependency timing', () => {
  it('records exactly one neon timing per query fetch', async () => {
    const { fetchFunction, recorded } = await installedFetchFunction();
    await fetchFunction('https://ep-x.neon.tech/sql');

    expect(fetchWithTimeoutMock).toHaveBeenCalledTimes(1);
    expect(recorded).toHaveLength(1);
    expect(recorded[0]?.[0]).toBe('neon');
    expect(recorded[0]?.[1]).toBeGreaterThanOrEqual(0);
  });

  it('records a failed query and still rejects for the driver', async () => {
    fetchWithTimeoutMock.mockRejectedValueOnce(new Error('neon unreachable'));

    const { fetchFunction, recorded } = await installedFetchFunction();
    await expect(fetchFunction('https://ep-x.neon.tech/sql')).rejects.toThrow(
      'neon unreachable',
    );

    expect(recorded.map(([kind]) => kind)).toEqual(['neon']);
  });

  it('still bounds the query through the shared timeout helper', async () => {
    const { fetchFunction } = await installedFetchFunction();
    await fetchFunction('https://ep-x.neon.tech/sql', { method: 'POST' });

    expect(fetchWithTimeoutMock).toHaveBeenCalledWith(
      'https://ep-x.neon.tech/sql',
      { method: 'POST' },
      30_000,
    );
  });

  it('installs nothing at import time, keeping the module import-side-effect-free', async () => {
    vi.stubEnv('DATABASE_URL', NEON_URL);
    await import('./index');

    expect(neonConfigMock.fetchFunction).toBeUndefined();
    expect(neonMock).not.toHaveBeenCalled();
  });
});
