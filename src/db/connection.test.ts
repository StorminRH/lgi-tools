import { afterEach, describe, expect, it, vi } from 'vitest';
import { isPooledHost, resolveLockConnectionUrl } from './index';

// Neon-style endpoints. The pooled one carries the `-pooler` host suffix
// (PgBouncer transaction mode); the direct one does not.
const POOLED =
  'postgres://u:p@ep-cool-name-123456-pooler.us-east-2.aws.neon.tech/db?sslmode=require';
const DIRECT =
  'postgres://u:p@ep-cool-name-123456.us-east-2.aws.neon.tech/db?sslmode=require';
const LOCAL = 'postgres://lgi:lgi@localhost:5433/lgi_tools';

// The request-path `db` is constructed lazily from the Neon HTTP driver. Mock
// the driver + adapter so touching the lazy Proxy never opens a real
// connection: we assert which URL the client is built with, not that it
// connects.
const { neonMock, drizzleHttpMock } = vi.hoisted(() => ({
  neonMock: vi.fn(() => ({ httpClient: true })),
  drizzleHttpMock: vi.fn(() => ({ select: () => {} })),
}));
vi.mock('@neondatabase/serverless', () => ({ neon: neonMock }));
vi.mock('drizzle-orm/neon-http', () => ({ drizzle: drizzleHttpMock }));

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
  it('prefers DATABASE_URL_UNPOOLED and resolves to a non-pooled host', () => {
    const url = resolveLockConnectionUrl({
      DATABASE_URL: POOLED,
      DATABASE_URL_UNPOOLED: DIRECT,
    });
    expect(url).toBe(DIRECT);
    // The guarantee the audit asked for: the lock holder's connection is
    // never the pooled one.
    expect(isPooledHost(url)).toBe(false);
  });

  it('falls back to DATABASE_URL when no unpooled var is set (local dev)', () => {
    const url = resolveLockConnectionUrl({ DATABASE_URL: LOCAL });
    expect(url).toBe(LOCAL);
    expect(isPooledHost(url)).toBe(false);
  });

  it('fails closed when only a pooled DATABASE_URL is available', () => {
    expect(() => resolveLockConnectionUrl({ DATABASE_URL: POOLED })).toThrow(
      /-pooler/,
    );
  });

  it('throws when no connection string is set at all', () => {
    expect(() => resolveLockConnectionUrl({})).toThrow(/DATABASE_URL is not set/);
  });
});

describe('request-path db (Neon HTTP driver)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules(); // reset the module-singleton _db between cases
    neonMock.mockClear();
    drizzleHttpMock.mockClear();
  });

  it('lazily constructs the neon-http client off DATABASE_URL on first use', async () => {
    vi.stubEnv('LOCAL_DB_DRIVER', '');
    vi.stubEnv('DATABASE_URL', POOLED);
    const { db } = await import('./index');
    expect(neonMock).not.toHaveBeenCalled(); // import alone holds no connection
    void db.select; // trigger the lazy Proxy → getDb() → getClient()
    expect(neonMock).toHaveBeenCalledTimes(1);
    expect(neonMock).toHaveBeenCalledWith(POOLED);
    expect(drizzleHttpMock).toHaveBeenCalledWith({ client: { httpClient: true } });
  });

  it('throws a clear error when DATABASE_URL is unset', async () => {
    vi.stubEnv('DATABASE_URL', ''); // empty is falsy regardless of ambient env
    const { db } = await import('./index');
    expect(() => void db.select).toThrow(/DATABASE_URL is not set/);
    expect(neonMock).not.toHaveBeenCalled();
  });
});
