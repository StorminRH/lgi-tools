import { afterEach, describe, expect, it, vi } from 'vitest';
import { isPooledHost, resolveLockConnectionUrl } from './index';

const POOLED =
  'postgres://u:p@ep-cool-name-123456-pooler.us-east-2.aws.neon.tech/db?sslmode=require';
const DIRECT =
  'postgres://u:p@ep-cool-name-123456.us-east-2.aws.neon.tech/db?sslmode=require';
const LOCAL = 'postgres://lgi:lgi@localhost:5433/lgi_tools';

const { neonMock, drizzleHttpMock, neonConfigMock } = vi.hoisted(() => ({
  neonMock: vi.fn(() => ({ httpClient: true })),
  drizzleHttpMock: vi.fn(() => ({ select: () => {} })),
  neonConfigMock: {} as { fetchFunction?: unknown },
}));
vi.mock('@neondatabase/serverless', () => ({
  neon: neonMock,
  neonConfig: neonConfigMock,
}));
vi.mock('drizzle-orm/neon-http', () => ({ drizzle: drizzleHttpMock }));

const { fetchWithTimeoutMock } = vi.hoisted(() => ({
  fetchWithTimeoutMock: vi.fn(async () => new Response('{}')),
}));
vi.mock('@/lib/fetch-with-timeout', () => ({
  fetchWithTimeout: fetchWithTimeoutMock,
}));

describe('isPooledHost', () => {
  it('flags a `-pooler` host', () => {
    expect(isPooledHost(POOLED)).toBe(true);
  });

  it('passes a direct Neon host and a local host', () => {
    expect(isPooledHost(DIRECT)).toBe(false);
    expect(isPooledHost(LOCAL)).toBe(false);
  });

  it('throws a readable error on a malformed connection string', () => {
    expect(() => isPooledHost('not-a-url')).toThrow(/not a valid URL/);
  });
});

describe('resolveLockConnectionUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function stubLockUrls(env: {
    DATABASE_URL?: string;
    DATABASE_URL_UNPOOLED?: string;
    LGI_DATABASE_URL?: string;
    LGI_DATABASE_URL_UNPOOLED?: string;
  }): void {
    vi.stubEnv('DATABASE_URL', env.DATABASE_URL);
    vi.stubEnv('DATABASE_URL_UNPOOLED', env.DATABASE_URL_UNPOOLED);
    vi.stubEnv('LGI_DATABASE_URL', env.LGI_DATABASE_URL);
    vi.stubEnv('LGI_DATABASE_URL_UNPOOLED', env.LGI_DATABASE_URL_UNPOOLED);
  }

  it('prefers DATABASE_URL_UNPOOLED and resolves to a non-pooled host', () => {
    stubLockUrls({ DATABASE_URL: POOLED, DATABASE_URL_UNPOOLED: DIRECT });
    const url = resolveLockConnectionUrl();
    expect(url).toBe(DIRECT);
    expect(isPooledHost(url)).toBe(false);
  });

  it('falls back to DATABASE_URL when no unpooled var is set (local dev)', () => {
    stubLockUrls({ DATABASE_URL: LOCAL });
    const url = resolveLockConnectionUrl();
    expect(url).toBe(LOCAL);
    expect(isPooledHost(url)).toBe(false);
  });

  it('fails closed when only a pooled DATABASE_URL is available', () => {
    stubLockUrls({ DATABASE_URL: POOLED });
    expect(() => resolveLockConnectionUrl()).toThrow(/-pooler/);
  });

  it('throws when no connection string is set at all', () => {
    stubLockUrls({});
    expect(() => resolveLockConnectionUrl()).toThrow(/DATABASE_URL is not set/);
  });

  it('prefers LGI_DATABASE_URL_UNPOOLED over the integration unpooled URL', () => {
    const stagingDirect =
      'postgres://u:p@ep-staging-123456.us-east-2.aws.neon.tech/db?sslmode=require';
    stubLockUrls({
      DATABASE_URL: POOLED,
      DATABASE_URL_UNPOOLED: DIRECT,
      LGI_DATABASE_URL: POOLED,
      LGI_DATABASE_URL_UNPOOLED: stagingDirect,
    });
    expect(resolveLockConnectionUrl()).toBe(stagingDirect);
  });

  it('fails closed when only a pooled LGI_DATABASE_URL override is set', () => {
    stubLockUrls({
      DATABASE_URL: DIRECT,
      DATABASE_URL_UNPOOLED: DIRECT,
      LGI_DATABASE_URL: POOLED,
    });
    expect(() => resolveLockConnectionUrl()).toThrow(/-pooler/);
  });

  it('ignores an empty LGI_DATABASE_URL_UNPOOLED override', () => {
    stubLockUrls({
      DATABASE_URL: POOLED,
      DATABASE_URL_UNPOOLED: DIRECT,
      LGI_DATABASE_URL_UNPOOLED: '',
    });
    expect(resolveLockConnectionUrl()).toBe(DIRECT);
  });
});

describe('request-path db (Neon HTTP driver)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    neonMock.mockClear();
    drizzleHttpMock.mockClear();
    fetchWithTimeoutMock.mockClear();
    delete neonConfigMock.fetchFunction;
  });

  it('lazily constructs the neon-http client off DATABASE_URL on first use', async () => {
    vi.stubEnv('LOCAL_DB_DRIVER', '');
    vi.stubEnv('DATABASE_URL', POOLED);
    const { db } = await import('./index');
    expect(neonMock).not.toHaveBeenCalled();
    void db.select;
    expect(neonMock).toHaveBeenCalledTimes(1);
    expect(neonMock).toHaveBeenCalledWith(POOLED);
    expect(drizzleHttpMock).toHaveBeenCalledWith({ client: { httpClient: true } });
  });

  it('constructs the neon-http client off LGI_DATABASE_URL when set', async () => {
    vi.stubEnv('LOCAL_DB_DRIVER', '');
    vi.stubEnv('DATABASE_URL', POOLED);
    vi.stubEnv('LGI_DATABASE_URL', DIRECT);
    const { db } = await import('./index');
    void db.select;
    expect(neonMock).toHaveBeenCalledWith(DIRECT);
  });

  it('installs the per-query timeout bound lazily, not on import', async () => {
    vi.stubEnv('LOCAL_DB_DRIVER', '');
    vi.stubEnv('DATABASE_URL', POOLED);
    const { db } = await import('./index');
    expect(neonConfigMock.fetchFunction).toBeUndefined();

    void db.select;
    expect(neonConfigMock.fetchFunction).toBeTypeOf('function');

    await (
      neonConfigMock.fetchFunction as (
        input: string | URL,
        init?: RequestInit,
      ) => Promise<Response>
    )('https://example.neon.tech/sql', { method: 'POST' });
    expect(fetchWithTimeoutMock).toHaveBeenCalledWith(
      'https://example.neon.tech/sql',
      { method: 'POST' },
      30_000,
    );
  });

  it('throws a clear error when DATABASE_URL is unset', async () => {
    vi.stubEnv('DATABASE_URL', '');
    const { db } = await import('./index');
    expect(() => void db.select).toThrow(/DATABASE_URL is not set/);
    expect(neonMock).not.toHaveBeenCalled();
  });
});
