import { describe, expect, it } from 'vitest';
import { remoteSkipSeedError } from './run-e2e-guard.mjs';

describe('run-e2e guard', () => {
  it('classifies local base URLs and gates remote skip-seed on operator storage', () => {
    expect(
      remoteSkipSeedError({
        baseUrl: 'http://localhost:3000',
        skipSeed: true,
        e2eStorageState: undefined,
      }),
    ).toBeNull();

    expect(
      remoteSkipSeedError({
        baseUrl: 'https://lgi.tools',
        skipSeed: true,
        e2eStorageState: undefined,
      }),
    ).toMatch(/E2E_STORAGE_STATE/);

    expect(
      remoteSkipSeedError({
        baseUrl: 'https://lgi.tools',
        skipSeed: true,
        e2eStorageState: 'operator.json',
      }),
    ).toBeNull();
  });
});
