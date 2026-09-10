import { describe, expect, it } from 'vitest';
import { canMintSyntheticPilot } from './synthetic-pilot';

describe('canMintSyntheticPilot', () => {
  it.each([
    {
      name: 'allows development on localhost',
      requestUrl: 'http://localhost:3000/api/dev/synthetic-pilot',
      nodeEnv: 'development',
      allowed: true,
    },
    {
      name: 'refuses 127.0.0.1 so the localhost cookie is never set on the wrong origin',
      requestUrl: 'http://127.0.0.1:3000/api/dev/synthetic-pilot',
      nodeEnv: 'development',
      allowed: false,
    },
    {
      name: 'refuses IPv6 loopback',
      requestUrl: 'http://[::1]:3000/api/dev/synthetic-pilot',
      nodeEnv: 'development',
      allowed: false,
    },
    {
      name: 'refuses production even on localhost',
      requestUrl: 'http://localhost:3000/api/dev/synthetic-pilot',
      nodeEnv: 'production',
      allowed: false,
    },
    {
      name: 'refuses a missing node env',
      requestUrl: 'http://localhost:3000/api/dev/synthetic-pilot',
      nodeEnv: undefined,
      allowed: false,
    },
    {
      name: 'refuses a preview host',
      requestUrl: 'https://lgi-tools.vercel.app/api/dev/synthetic-pilot',
      nodeEnv: 'development',
      allowed: false,
    },
    {
      name: 'refuses an unparseable url',
      requestUrl: 'not-a-url',
      nodeEnv: 'development',
      allowed: false,
    },
  ])('$name', ({ requestUrl, nodeEnv, allowed }) => {
    expect(canMintSyntheticPilot({ requestUrl, nodeEnv })).toBe(allowed);
  });
});
