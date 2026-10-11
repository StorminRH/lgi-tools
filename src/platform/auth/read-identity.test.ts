import { expect, test, vi } from 'vitest';
import {
  currentReadIdentity,
  isCurrentReadIdentity,
  publishReadIdentity,
  sameReadIdentity,
  subscribeReadIdentity,
} from './read-identity';

test('only the object last published is current: a value-equal republish keeps it, a return to an earlier account does not', () => {
  publishReadIdentity(null);
  const listener = vi.fn();
  const unsubscribe = subscribeReadIdentity(listener);

  expect(currentReadIdentity()).toBeNull();
  expect(isCurrentReadIdentity(null)).toBe(false);

  const first = { userId: 'account-a', characterId: 7 };
  publishReadIdentity(first);
  expect(listener).toHaveBeenCalledTimes(1);
  expect(isCurrentReadIdentity(first)).toBe(true);

  const republished = { userId: 'account-a', characterId: 7 };
  publishReadIdentity(republished);
  expect(listener).toHaveBeenCalledTimes(1);
  expect(currentReadIdentity()).toBe(first);
  expect(isCurrentReadIdentity(first)).toBe(true);
  expect(isCurrentReadIdentity(republished)).toBe(false);

  publishReadIdentity({ userId: 'account-b', characterId: 8 });
  const returned = { userId: 'account-a', characterId: 7 };
  publishReadIdentity(returned);
  expect(listener).toHaveBeenCalledTimes(3);
  expect(isCurrentReadIdentity(first)).toBe(false);
  expect(isCurrentReadIdentity(returned)).toBe(true);

  publishReadIdentity(null);
  publishReadIdentity(null);
  expect(listener).toHaveBeenCalledTimes(4);
  expect(isCurrentReadIdentity(returned)).toBe(false);
  expect(isCurrentReadIdentity(null)).toBe(false);
  unsubscribe();
});

test('sameReadIdentity compares the account and active character, not the object', () => {
  const owner = { userId: 'account-a', characterId: 7 };

  expect(sameReadIdentity(null, null)).toBe(true);
  expect(sameReadIdentity(null, owner)).toBe(false);
  expect(sameReadIdentity(owner, null)).toBe(false);
  expect(sameReadIdentity({ userId: 'account-a', characterId: 7 }, owner)).toBe(true);
  expect(sameReadIdentity({ userId: 'account-b', characterId: 7 }, owner)).toBe(false);
  expect(sameReadIdentity({ userId: 'account-a', characterId: 8 }, owner)).toBe(false);
});
