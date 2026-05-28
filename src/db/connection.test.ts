import { describe, expect, it } from 'vitest';
import { isPooledHost, resolveLockConnectionUrl } from './index';

// Neon-style endpoints. The pooled one carries the `-pooler` host suffix
// (PgBouncer transaction mode); the direct one does not.
const POOLED =
  'postgres://u:p@ep-cool-name-123456-pooler.us-east-2.aws.neon.tech/db?sslmode=require';
const DIRECT =
  'postgres://u:p@ep-cool-name-123456.us-east-2.aws.neon.tech/db?sslmode=require';
const LOCAL = 'postgres://lgi:lgi@localhost:5433/lgi_tools';

describe('isPooledHost', () => {
  it('flags a `-pooler` host', () => {
    expect(isPooledHost(POOLED)).toBe(true);
  });

  it('passes a direct Neon host and a local host', () => {
    expect(isPooledHost(DIRECT)).toBe(false);
    expect(isPooledHost(LOCAL)).toBe(false);
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
