import { describe, expect, it } from 'vitest';
import { isLocalBaseUrl, remoteSkipSeedError } from './run-e2e-guard.mjs';

describe('isLocalBaseUrl', () => {
  it('accepts localhost and loopback', () => {
    expect(isLocalBaseUrl('http://localhost:3000')).toBe(true);
    expect(isLocalBaseUrl('http://127.0.0.1:3000')).toBe(true);
    expect(isLocalBaseUrl('https://lgi.tools')).toBe(false);
  });
});

describe('remoteSkipSeedError', () => {
  it('allows local skip-seed without operator storage state', () => {
    expect(
      remoteSkipSeedError({
        baseUrl: 'http://localhost:3000',
        skipSeed: true,
        e2eStorageState: undefined,
        uxStorageState: undefined,
      }),
    ).toBeNull();
  });

  it('requires operator storage state for remote skip-seed', () => {
    expect(
      remoteSkipSeedError({
        baseUrl: 'https://lgi.tools',
        skipSeed: true,
        e2eStorageState: undefined,
        uxStorageState: undefined,
      }),
    ).toMatch(/E2E_STORAGE_STATE or UX_STORAGE_STATE/);
  });

  it('allows remote skip-seed when E2E_STORAGE_STATE is set', () => {
    expect(
      remoteSkipSeedError({
        baseUrl: 'https://lgi.tools',
        skipSeed: true,
        e2eStorageState: 'operator.json',
        uxStorageState: undefined,
      }),
    ).toBeNull();
  });
});
