import { describe, expect, it } from 'vitest';
import { canMintSyntheticPilot } from './synthetic-pilot';

describe('canMintSyntheticPilot', () => {
  it.each([
    'user@localhost:3000',
    'localhost:3000/path',
    'localhost:3000?query',
    'localhost:3000#fragment',
    ' localhost:3000',
    'localhost:3000 ',
    'localhost:65536',
    'localhost:',
    'localhost:abc',
    'localhost.evil.test',
  ])('rejects malformed localhost authority %s', (hostHeader) => {
    expect(canMintSyntheticPilot({ hostHeader, nodeEnv: 'development' })).toBe(false);
  });

  it.each([
    {
      name: 'allows development on localhost',
      hostHeader: 'localhost:3000',
      nodeEnv: 'development',
      allowed: true,
    },
    {
      name: 'allows localhost without a port',
      hostHeader: 'localhost',
      nodeEnv: 'development',
      allowed: true,
    },
    {
      name: 'refuses 127.0.0.1 so the localhost cookie is never set on the wrong origin',
      hostHeader: '127.0.0.1:3000',
      nodeEnv: 'development',
      allowed: false,
    },
    {
      name: 'refuses IPv6 loopback',
      hostHeader: '[::1]:3000',
      nodeEnv: 'development',
      allowed: false,
    },
    {
      name: 'refuses production even on localhost',
      hostHeader: 'localhost:3000',
      nodeEnv: 'production',
      allowed: false,
    },
    {
      name: 'refuses a missing node env',
      hostHeader: 'localhost:3000',
      nodeEnv: undefined,
      allowed: false,
    },
    {
      name: 'refuses a missing host header',
      hostHeader: null,
      nodeEnv: 'development',
      allowed: false,
    },
    {
      name: 'refuses a preview host',
      hostHeader: 'lgi-tools.vercel.app',
      nodeEnv: 'development',
      allowed: false,
    },
    {
      name: 'refuses an unparseable host header',
      hostHeader: 'not a host',
      nodeEnv: 'development',
      allowed: false,
    },
  ])('$name', ({ hostHeader, nodeEnv, allowed }) => {
    expect(canMintSyntheticPilot({ hostHeader, nodeEnv })).toBe(allowed);
  });
});
