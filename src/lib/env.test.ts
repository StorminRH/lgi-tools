import { afterEach, describe, expect, it, vi } from 'vitest';
import { isHostedVercel, readEnv, requireEnv, vercelProtectionBypassHeaders } from './env';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('readEnv', () => {
  it('returns undefined for an unset variable', () => {
    vi.stubEnv('CRON_SECRET', undefined);
    expect(readEnv('CRON_SECRET')).toBeUndefined();
  });

  it('returns the value for a set variable', () => {
    vi.stubEnv('CRON_SECRET', 's3cret');
    expect(readEnv('CRON_SECRET')).toBe('s3cret');
  });

  it("maps '' to undefined on a required (truthiness) variable", () => {
    vi.stubEnv('DATABASE_URL', '');
    expect(readEnv('DATABASE_URL')).toBeUndefined();
  });

  it('prefers a non-empty LGI_DATABASE_URL over DATABASE_URL', () => {
    vi.stubEnv('DATABASE_URL', 'postgres://integration/db');
    vi.stubEnv('LGI_DATABASE_URL', 'postgres://staging/db');
    expect(readEnv('DATABASE_URL')).toBe('postgres://staging/db');
  });

  it('ignores an empty LGI_DATABASE_URL override', () => {
    vi.stubEnv('DATABASE_URL', 'postgres://integration/db');
    vi.stubEnv('LGI_DATABASE_URL', '');
    expect(readEnv('DATABASE_URL')).toBe('postgres://integration/db');
  });

  it('prefers a non-empty LGI_DATABASE_URL_UNPOOLED over DATABASE_URL_UNPOOLED', () => {
    vi.stubEnv('DATABASE_URL_UNPOOLED', 'postgres://integration-direct/db');
    vi.stubEnv('LGI_DATABASE_URL_UNPOOLED', 'postgres://staging-direct/db');
    expect(readEnv('DATABASE_URL_UNPOOLED')).toBe('postgres://staging-direct/db');
  });

  it("passes '' through on a verbatim (nullish/comparison) variable", () => {
    vi.stubEnv('BETTER_AUTH_SECRET', '');
    vi.stubEnv('SESSION_SECRET', 'fallback');
    expect(readEnv('BETTER_AUTH_SECRET')).toBe('');
    expect(readEnv('BETTER_AUTH_SECRET') ?? readEnv('SESSION_SECRET')).toBe('');
  });
});

describe('requireEnv', () => {
  it('returns the value when set', () => {
    vi.stubEnv('EVE_CLIENT_ID', 'client-id');
    expect(requireEnv('EVE_CLIENT_ID')).toBe('client-id');
  });

  it('throws the exact legacy message when unset', () => {
    vi.stubEnv('EVE_CLIENT_ID', undefined);
    expect(() => requireEnv('EVE_CLIENT_ID')).toThrowError('EVE_CLIENT_ID is not set');
  });

  it('throws when set but empty', () => {
    vi.stubEnv('DATABASE_URL', '');
    expect(() => requireEnv('DATABASE_URL')).toThrowError('DATABASE_URL is not set');
  });

  it('returns LGI_DATABASE_URL when DATABASE_URL is empty', () => {
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('LGI_DATABASE_URL', 'postgres://staging/db');
    expect(requireEnv('DATABASE_URL')).toBe('postgres://staging/db');
  });
});

describe('isHostedVercel', () => {
  it('is true only for Vercel production and preview', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(isHostedVercel()).toBe(true);
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(isHostedVercel()).toBe(true);
  });

  it('is false for local, CI, and vercel development', () => {
    vi.stubEnv('VERCEL_ENV', undefined);
    expect(isHostedVercel()).toBe(false);
    vi.stubEnv('VERCEL_ENV', '');
    expect(isHostedVercel()).toBe(false);
    vi.stubEnv('VERCEL_ENV', 'development');
    expect(isHostedVercel()).toBe(false);
  });
});

describe('vercelProtectionBypassHeaders', () => {
  it('returns the bypass header when the secret is set', () => {
    vi.stubEnv('VERCEL_AUTOMATION_BYPASS_SECRET', 'bypass-secret');
    expect(vercelProtectionBypassHeaders()).toEqual({
      'x-vercel-protection-bypass': 'bypass-secret',
    });
  });

  it('returns an empty record when the secret is unset or empty', () => {
    vi.stubEnv('VERCEL_AUTOMATION_BYPASS_SECRET', undefined);
    expect(vercelProtectionBypassHeaders()).toEqual({});
    vi.stubEnv('VERCEL_AUTOMATION_BYPASS_SECRET', '');
    expect(vercelProtectionBypassHeaders()).toEqual({});
  });
});
