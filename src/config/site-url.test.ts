import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => vi.unstubAllEnvs());

async function siteUrlFor(value: string | undefined): Promise<string> {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', value);
  vi.resetModules();
  const { SITE_URL } = await import('./site-url');
  return SITE_URL;
}

test('SITE_URL uses a set NEXT_PUBLIC_SITE_URL and falls back to the public host when unset or empty', async () => {
  expect(await siteUrlFor('http://localhost:3000')).toBe('http://localhost:3000');
  expect(await siteUrlFor('')).toBe('https://lgi.tools');
  expect(await siteUrlFor(undefined)).toBe('https://lgi.tools');
});
