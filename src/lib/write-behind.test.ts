import { afterEach, expect, test, vi } from 'vitest';
import { silenceConsolePrefixes } from '@/lib/__tests__/console-tags';
import { notifyObserver, type WriteBehindResult } from './write-behind';

afterEach(() => {
  vi.restoreAllMocks();
});

const partial: WriteBehindResult = { outcome: 'partial', attempted: 3, written: 2, durationMs: 40 };

test('hands the result to the observer, and resolves quietly without one', async () => {
  const errors = vi.spyOn(console, 'error');
  const observer = vi.fn();

  await expect(notifyObserver(observer, partial, 'market-test')).resolves.toBeUndefined();
  await expect(notifyObserver(undefined, partial, 'market-test')).resolves.toBeUndefined();

  expect(observer.mock.calls).toEqual([[partial]]);
  expect(errors).not.toHaveBeenCalled();
});

test('logs a throwing observer under its scope and resolves', async () => {
  const errors = silenceConsolePrefixes('error', ['[market-test] ']);
  const boom = new Error('observer down');

  await expect(
    notifyObserver(
      () => {
        throw boom;
      },
      partial,
      'market-test',
    ),
  ).resolves.toBeUndefined();

  expect(errors.mock.calls).toEqual([['[market-test] write-behind observer failed', boom]]);
});
