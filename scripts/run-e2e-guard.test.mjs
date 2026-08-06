import { describe, expect, it } from 'vitest';
import { isLocalBaseUrl, remoteSkipSeedError } from './run-e2e-guard.mjs';

describe('run-e2e guard', () => {
  it('classifies local base URLs and gates remote skip-seed on operator storage', () => {
    expect(isLocalBaseUrl('http://localhost:3000')).toBe(true);
    expect(isLocalBaseUrl('http://127.0.0.1:3000')).toBe(true);
    expect(isLocalBaseUrl('https://lgi.tools')).toBe(false);

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
});
