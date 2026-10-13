import { expect, test } from 'vitest';
import { purgeScopeRequestSchema } from './convex-door-contract';

test('a purge scope names a user and one positive character id or null for all of them', () => {
  const accepts = (body: unknown) => purgeScopeRequestSchema.safeParse(body).success;

  expect(accepts({ userId: 'user-1', characterId: null })).toBe(true);
  expect(accepts({ userId: 'user-1', characterId: 90_000_001 })).toBe(true);

  expect(accepts({ userId: '', characterId: null })).toBe(false);
  expect(accepts({ userId: 'user-1', characterId: 0 })).toBe(false);
  expect(accepts({ userId: 'user-1', characterId: -90_000_001 })).toBe(false);
  expect(accepts({ userId: 'user-1', characterId: 1.5 })).toBe(false);
  expect(accepts({ userId: 'user-1', characterId: Number.MAX_SAFE_INTEGER + 1 })).toBe(false);
  expect(accepts({ userId: 'user-1' })).toBe(false);
  expect(accepts({ userId: 42, characterId: 'nope' })).toBe(false);
});
