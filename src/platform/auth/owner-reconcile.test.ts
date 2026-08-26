import { expect, test } from 'vitest';
import { classifyOwnerReconcile } from './owner-reconcile';

const H1 = 'owner-hash-one';
const H2 = 'owner-hash-two';

test('classifyOwnerReconcile purges a hash transfer, backfills a missing stored hash, and no-ops otherwise', () => {
  expect(classifyOwnerReconcile(H1, H1)).toBe('noop');
  expect(classifyOwnerReconcile(H1, H2)).toBe('purge');
  expect(classifyOwnerReconcile(null, H1)).toBe('backfill');
  expect(classifyOwnerReconcile('', H1)).toBe('backfill');
  expect(classifyOwnerReconcile(H1, undefined)).toBe('noop');
  expect(classifyOwnerReconcile(H1, null)).toBe('noop');
  expect(classifyOwnerReconcile(H1, '')).toBe('noop');
  expect(classifyOwnerReconcile(null, undefined)).toBe('noop');
});
