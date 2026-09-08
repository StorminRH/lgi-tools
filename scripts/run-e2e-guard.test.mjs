import { describe, expect, it } from 'vitest';
import { isLocalBaseUrl, remoteSkipSeedError } from './run-e2e-guard.mjs';

describe('run-e2e guard', () => {
  it('classifies local base URLs and gates remote skip-seed on operator storage', () => {
    expect(
      remoteSkipSeedError({
        baseUrl: 'http://localhost:3000',
        skipSeed: true,
        e2eStorageState: undefined,
        uxStorageState: undefined,
      }),
    ).toBeNull();

    expect(
      remoteSkipSeedError({
        baseUrl: 'https://lgi.tools',
        skipSeed: true,
        e2eStorageState: undefined,
        uxStorageState: undefined,
      }),
    ).toMatch(/E2E_STORAGE_STATE or UX_STORAGE_STATE/);

    expect(
      remoteSkipSeedError({
        baseUrl: 'https://lgi.tools',
        skipSeed: true,
        e2eStorageState: 'operator.json',
        uxStorageState: undefined,
      }),
    ).toBeNull();
  });

  it('rejects remote synthetic writes before seeding regardless of supplied storage', () => {
    for (const baseUrl of ['https://lgi.tools', 'https://staging.lgi.tools']) {
      expect(remoteSkipSeedError({ baseUrl, skipSeed: false, e2eStorageState: 'operator.json' }))
        .toMatch(/Synthetic E2E seeding is forbidden/);
    }
    expect(remoteSkipSeedError({ baseUrl: 'https://lgi.tools', skipSeed: true, uxStorageState: ' ' }))
      .toMatch(/requires E2E_STORAGE_STATE/);
  });

  it('accepts only actual loopback HTTP targets and rejects malformed targets', () => {
    for (const baseUrl of ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://[::1]:3000']) {
      expect(isLocalBaseUrl(baseUrl)).toBe(true);
      expect(remoteSkipSeedError({ baseUrl, skipSeed: false })).toBeNull();
    }
    for (const baseUrl of ['https://localhost.example.com', 'https://localhost@lgi.tools', 'file:///tmp/app', '/atlas']) {
      expect(isLocalBaseUrl(baseUrl)).toBe(false);
      expect(remoteSkipSeedError({ baseUrl, skipSeed: false })).not.toBeNull();
    }
  });
});
