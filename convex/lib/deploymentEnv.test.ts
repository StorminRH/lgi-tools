import { afterEach, expect, it, vi } from 'vitest';
import { readAppOrigin } from './deploymentEnv';

afterEach(() => vi.unstubAllEnvs());

it.each([
  ['unset', undefined, undefined],
  ['empty', '', undefined],
  ['schemeless', 'lgi.tools', undefined],
  ['plain HTTP off loopback', 'http://evil.example', undefined],
  ['plain HTTP on a loopback lookalike', 'http://localhost.evil.example:3000', undefined],
  ['HTTPS with a trailing slash', 'https://lgi.tools/', 'https://lgi.tools'],
  ['HTTPS with a path', 'https://staging.lgi.tools/app/', 'https://staging.lgi.tools'],
  ['loopback HTTP', 'http://localhost:3000', 'http://localhost:3000'],
] as const)('reads a SITE_URL that is %s', (_case, value, origin) => {
  vi.stubEnv('SITE_URL', value);
  expect(readAppOrigin()).toBe(origin);
});
