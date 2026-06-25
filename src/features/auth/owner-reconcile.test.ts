import { describe, expect, it } from 'vitest';
import { classifyOwnerReconcile } from './owner-reconcile';

const H1 = 'owner-hash-one';
const H2 = 'owner-hash-two';

describe('classifyOwnerReconcile', () => {
  it('is a no-op when the stored hash matches the JWT (the common re-login)', () => {
    expect(classifyOwnerReconcile(H1, H1)).toBe('noop');
  });

  it('purges when the stored hash differs from the JWT (a transfer)', () => {
    expect(classifyOwnerReconcile(H1, H2)).toBe('purge');
  });

  it('backfills a legacy row with no stored hash, never purging', () => {
    expect(classifyOwnerReconcile(null, H1)).toBe('backfill');
  });

  it('treats an empty stored hash like null (backfill, never a false purge)', () => {
    expect(classifyOwnerReconcile('', H1)).toBe('backfill');
  });

  it('never acts when the JWT carries no owner claim, even with a stored hash', () => {
    expect(classifyOwnerReconcile(H1, undefined)).toBe('noop');
    expect(classifyOwnerReconcile(H1, null)).toBe('noop');
    expect(classifyOwnerReconcile(H1, '')).toBe('noop');
  });

  it('is a no-op when neither side has a hash', () => {
    expect(classifyOwnerReconcile(null, undefined)).toBe('noop');
  });
});
