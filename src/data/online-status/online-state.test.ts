import { describe, expect, it } from 'vitest';
import { deriveOnlineState } from './online-state';

describe('deriveOnlineState', () => {
  it('maps true → online', () => {
    expect(deriveOnlineState(true)).toBe('online');
  });

  it('maps false → offline', () => {
    expect(deriveOnlineState(false)).toBe('offline');
  });

  it('maps undefined (no live doc) → unknown', () => {
    expect(deriveOnlineState(undefined)).toBe('unknown');
  });
});
