import { afterEach, expect, test, vi } from 'vitest';
import {
  isHostedVercel,
  readAuthSecret,
  readEnv,
  requireEnv,
  vercelProtectionBypassHeaders,
} from './env';

afterEach(() => {
  vi.unstubAllEnvs();
});

test("readEnv maps unset and a required (truthiness) variable's '' to undefined, and passes '' through on a verbatim one", () => {
  vi.stubEnv('CRON_SECRET', undefined);
  expect(readEnv('CRON_SECRET')).toBeUndefined();
  vi.stubEnv('CRON_SECRET', 's3cret');
  expect(readEnv('CRON_SECRET')).toBe('s3cret');

  vi.stubEnv('DATABASE_URL', '');
  expect(readEnv('DATABASE_URL')).toBeUndefined();

  vi.stubEnv('BETTER_AUTH_SECRET', '');
  expect(readEnv('BETTER_AUTH_SECRET')).toBe('');
});

test('readEnv prefers a non-empty LGI_ override for both database URLs and ignores an empty one', () => {
  vi.stubEnv('DATABASE_URL', 'postgres://integration/db');
  vi.stubEnv('LGI_DATABASE_URL', 'postgres://staging/db');
  expect(readEnv('DATABASE_URL')).toBe('postgres://staging/db');

  vi.stubEnv('LGI_DATABASE_URL', '');
  expect(readEnv('DATABASE_URL')).toBe('postgres://integration/db');

  vi.stubEnv('DATABASE_URL_UNPOOLED', 'postgres://integration-direct/db');
  vi.stubEnv('LGI_DATABASE_URL_UNPOOLED', 'postgres://staging-direct/db');
  expect(readEnv('DATABASE_URL_UNPOOLED')).toBe('postgres://staging-direct/db');
});

test('readAuthSecret prefers BETTER_AUTH_SECRET and falls back to SESSION_SECRET when it is unset or empty', () => {
  vi.stubEnv('BETTER_AUTH_SECRET', 'primary');
  vi.stubEnv('SESSION_SECRET', 'fallback');
  expect(readAuthSecret()).toBe('primary');

  vi.stubEnv('BETTER_AUTH_SECRET', '');
  expect(readAuthSecret()).toBe('fallback');

  vi.stubEnv('BETTER_AUTH_SECRET', undefined);
  expect(readAuthSecret()).toBe('fallback');

  vi.stubEnv('SESSION_SECRET', '');
  expect(readAuthSecret()).toBeUndefined();

  vi.stubEnv('BETTER_AUTH_SECRET', '');
  vi.stubEnv('SESSION_SECRET', undefined);
  expect(readAuthSecret()).toBeUndefined();
});

test('requireEnv returns a set value, the LGI_ override over an empty value, and throws the exact legacy message when unset or empty', () => {
  vi.stubEnv('EVE_CLIENT_ID', 'client-id');
  expect(requireEnv('EVE_CLIENT_ID')).toBe('client-id');
  vi.stubEnv('EVE_CLIENT_ID', undefined);
  expect(() => requireEnv('EVE_CLIENT_ID')).toThrowError('EVE_CLIENT_ID is not set');

  vi.stubEnv('DATABASE_URL', '');
  expect(() => requireEnv('DATABASE_URL')).toThrowError('DATABASE_URL is not set');
  vi.stubEnv('LGI_DATABASE_URL', 'postgres://staging/db');
  expect(requireEnv('DATABASE_URL')).toBe('postgres://staging/db');
});

test('isHostedVercel is true only for Vercel production and preview', () => {
  vi.stubEnv('VERCEL_ENV', 'production');
  expect(isHostedVercel()).toBe(true);
  vi.stubEnv('VERCEL_ENV', 'preview');
  expect(isHostedVercel()).toBe(true);

  vi.stubEnv('VERCEL_ENV', undefined);
  expect(isHostedVercel()).toBe(false);
  vi.stubEnv('VERCEL_ENV', '');
  expect(isHostedVercel()).toBe(false);
  vi.stubEnv('VERCEL_ENV', 'development');
  expect(isHostedVercel()).toBe(false);
});

test('vercelProtectionBypassHeaders sends the bypass header only when the secret is set', () => {
  vi.stubEnv('VERCEL_AUTOMATION_BYPASS_SECRET', 'bypass-secret');
  expect(vercelProtectionBypassHeaders()).toEqual({
    'x-vercel-protection-bypass': 'bypass-secret',
  });

  vi.stubEnv('VERCEL_AUTOMATION_BYPASS_SECRET', undefined);
  expect(vercelProtectionBypassHeaders()).toEqual({});
  vi.stubEnv('VERCEL_AUTOMATION_BYPASS_SECRET', '');
  expect(vercelProtectionBypassHeaders()).toEqual({});
});
