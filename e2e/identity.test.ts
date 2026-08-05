import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_STORAGE_STATE_PATH,
  resolveE2eStorageStatePath,
  usesSyntheticE2ePilot,
} from './identity';

afterEach(() => {
  delete process.env.E2E_STORAGE_STATE;
  delete process.env.UX_STORAGE_STATE;
});

describe('resolveE2eStorageStatePath', () => {
  it('defaults to the local seed path', () => {
    expect(resolveE2eStorageStatePath()).toBe(DEFAULT_STORAGE_STATE_PATH);
  });

  it('prefers E2E_STORAGE_STATE over UX_STORAGE_STATE', () => {
    process.env.UX_STORAGE_STATE = 'from-ux.json';
    process.env.E2E_STORAGE_STATE = 'from-e2e.json';
    expect(resolveE2eStorageStatePath()).toBe('from-e2e.json');
  });
});

describe('usesSyntheticE2ePilot', () => {
  it('matches the default relative path and absolute suffixes', () => {
    expect(usesSyntheticE2ePilot(DEFAULT_STORAGE_STATE_PATH)).toBe(true);
    expect(usesSyntheticE2ePilot(`/tmp/${DEFAULT_STORAGE_STATE_PATH}`)).toBe(true);
    expect(usesSyntheticE2ePilot('operator-export.json')).toBe(false);
  });
});
