import { describe, expect, it } from 'vitest';
import { deriveOnlineState } from './online-state';

describe('deriveOnlineState', () => {
  it('maps live flags to online, offline, or unknown', () => {
    expect(deriveOnlineState(true)).toBe('online');
    expect(deriveOnlineState(false)).toBe('offline');
    expect(deriveOnlineState(undefined)).toBe('unknown');
  });
});
