import { afterEach, describe, expect, it, vi } from 'vitest';
import { readEnv, requireEnv } from './env';

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
    vi.stubEnv('RESEND_API_KEY', '');
    expect(readEnv('RESEND_API_KEY')).toBeUndefined();
  });

  it("passes '' through on a verbatim (nullish/comparison) variable", () => {
    // Parity with `process.env.BETTER_AUTH_SECRET ?? process.env.SESSION_SECRET`:
    // a set-but-empty first var must keep winning the ?? chain.
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
});
