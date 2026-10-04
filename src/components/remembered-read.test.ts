import { beforeEach, expect, test, vi } from 'vitest';

vi.mock('react', () => ({
  useSyncExternalStore: (_subscribe: unknown, getSnapshot: () => unknown) => getSnapshot(),
}));
import { createRememberedRead, useRememberedRead } from './remembered-read';
import { currentReadIdentity, publishReadIdentity } from '@/platform/auth/read-identity';

beforeEach(() => publishReadIdentity(null));

test('a same-identity return draws the last result, while unresolved and signed-out sessions see nothing', () => {
  const memory = createRememberedRead<{ rows: number }>();
  expect(useRememberedRead(memory)).toBeNull();
  memory.set({ rows: 1 }, null);
  expect(memory.get()).toBeNull();
  publishReadIdentity({ userId: 'account-a', characterId: 7 });
  const identity = currentReadIdentity();
  memory.set({ rows: 2 }, identity);
  expect(useRememberedRead(memory)).toEqual({ rows: 2 });
  publishReadIdentity({ userId: 'account-a', characterId: 7 });
  expect(currentReadIdentity()).toBe(identity);
  expect(useRememberedRead(memory)).toEqual({ rows: 2 });
  publishReadIdentity(null);
  expect(useRememberedRead(memory)).toBeNull();
  expect(memory.get()).toBeNull();
});

test.each([
  { userId: 'account-b', characterId: 7 },
  { userId: 'account-a', characterId: 8 },
  null,
])('a cross-tab identity change to %j clears every memory and rejects old in-flight writes', (next) => {
  const profiles = createRememberedRead<string[]>();
  const slots = createRememberedRead<number[]>();
  publishReadIdentity({ userId: 'account-a', characterId: 7 });
  const identity = currentReadIdentity();
  profiles.set(['Private facilities'], identity);
  slots.set([7], identity);
  publishReadIdentity(next);
  expect(useRememberedRead(profiles)).toBeNull();
  expect(useRememberedRead(slots)).toBeNull();
  profiles.set(['Late response'], identity);
  expect(profiles.get()).toBeNull();
});

test('returning to the original account cannot revive a request from its earlier scope', () => {
  const memory = createRememberedRead<string>();
  publishReadIdentity({ userId: 'account-a', characterId: 7 });
  const original = currentReadIdentity();
  publishReadIdentity({ userId: 'account-b', characterId: 8 });
  publishReadIdentity({ userId: 'account-a', characterId: 7 });
  expect(currentReadIdentity()).not.toBe(original);
  memory.set('Old request', original);
  expect(useRememberedRead(memory)).toBeNull();
  memory.set('New request', currentReadIdentity());
  expect(useRememberedRead(memory)).toBe('New request');
});
