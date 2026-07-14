import { describe, expect, it } from 'vitest';
import { snapshotRequestHash } from './request-hash';

describe('snapshotRequestHash', () => {
  it('is stable for one canonical request and changes with endpoint or source version', () => {
    const endpoint = '/corporations/5000/assets/';
    const hash = snapshotRequestHash(endpoint, '2025-08-26');

    expect(hash).toHaveLength(64);
    expect(snapshotRequestHash(endpoint, '2025-08-26')).toBe(hash);
    expect(snapshotRequestHash('/corporations/5001/assets/', '2025-08-26')).not.toBe(hash);
    expect(snapshotRequestHash(endpoint, '2026-01-01')).not.toBe(hash);
  });
});
