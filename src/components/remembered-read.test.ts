import { beforeEach, expect, test, vi } from 'vitest';
import { settle } from '@/lib/__tests__/hook-runtime';

const rt = await vi.hoisted(async () =>
  (await import('@/lib/__tests__/hook-runtime')).createHookRuntime({ memoizeCallbacks: true }));

vi.mock('react', () => rt.react);
import { createRememberedRead, type RememberedRead, useRememberedRead, useRememberedResource } from './remembered-read';
import { currentReadIdentity, publishReadIdentity } from '@/platform/auth/read-identity';

beforeEach(() => {
  rt.unmount();
  publishReadIdentity(null);
});

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

function pending<T>() {
  const signals: AbortSignal[] = [];
  const answers: Array<(value: T | null) => void> = [];
  const read = vi.fn((signal: AbortSignal) => {
    signals.push(signal);
    return new Promise<T | null>((resolve) => answers.push(resolve));
  });
  return { read, signals, answer: (index: number, value: T | null) => answers[index]!(value) };
}

const resource = <T>(
  memory: RememberedRead<T>,
  read: (signal: AbortSignal) => Promise<T | null>,
  opts?: Parameters<typeof useRememberedResource>[2],
) => rt.render(() => useRememberedResource(memory, read, opts));

test('a remembered resource reads once per session, draws the answer, and keeps it when a later read finds nothing', async () => {
  const memory = createRememberedRead<string>();
  const read = vi.fn(async (): Promise<string | null> => 'Sotiyo');
  publishReadIdentity({ userId: 'account-a', characterId: 7 });
  expect(resource(memory, read)).toBeNull();
  await settle();
  expect(resource(memory, read)).toBe('Sotiyo');
  expect(read).toHaveBeenCalledOnce();

  rt.unmount();
  read.mockResolvedValueOnce(null);
  expect(resource(memory, read)).toBe('Sotiyo');
  await settle();
  expect(resource(memory, read)).toBe('Sotiyo');
  expect(read).toHaveBeenCalledTimes(2);
});

test('a disabled or signed-out resource never reads', () => {
  const memory = createRememberedRead<string>();
  const read = vi.fn(async () => 'Sotiyo');
  expect(resource(memory, read)).toBeNull();
  publishReadIdentity({ userId: 'account-a', characterId: 7 });
  expect(resource(memory, read, { enabled: false })).toBeNull();
  expect(read).not.toHaveBeenCalled();
});

test('a new refresh key reads again and only the latest answer lands', async () => {
  const memory = createRememberedRead<string>();
  const { read, signals, answer } = pending<string>();
  publishReadIdentity({ userId: 'account-a', characterId: 7 });
  resource(memory, read, { refreshKey: 0 });
  resource(memory, read, { refreshKey: 1 });
  expect(signals.map((signal) => signal.aborted)).toEqual([true, false]);
  answer(1, 'Azbel');
  answer(0, 'Raitaru');
  await settle();
  expect(resource(memory, read, { refreshKey: 1 })).toBe('Azbel');
  expect(read).toHaveBeenCalledTimes(2);
});

test("a session change aborts the earlier session's read, and its late answer never reaches the new one", async () => {
  const memory = createRememberedRead<string>();
  const { read, signals, answer } = pending<string>();
  publishReadIdentity({ userId: 'account-a', characterId: 7 });
  resource(memory, read);
  publishReadIdentity({ userId: 'account-b', characterId: 7 });
  expect(resource(memory, read)).toBeNull();
  expect(signals.map((signal) => signal.aborted)).toEqual([true, false]);
  answer(0, 'Account A structures');
  await settle();
  expect(resource(memory, read)).toBeNull();
  answer(1, 'Account B structures');
  await settle();
  expect(resource(memory, read)).toBe('Account B structures');

  rt.unmount();
  expect(signals.map((signal) => signal.aborted)).toEqual([true, false]);
  resource(memory, read);
  rt.unmount();
  expect(signals[2]?.aborted).toBe(true);
});
