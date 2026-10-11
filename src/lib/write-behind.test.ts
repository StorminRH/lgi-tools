import { afterEach, expect, test, vi } from 'vitest';
import { silenceConsolePrefixes } from '@/lib/__tests__/console-tags';
import { runWriteBehind } from './write-behind';

afterEach(() => {
  vi.restoreAllMocks();
});

test('reports succeeded, partial and failed from how many of the attempted writes succeeded', async () => {
  const errors = vi.spyOn(console, 'error');
  vi.spyOn(Date, 'now')
    .mockReturnValueOnce(1_000)
    .mockReturnValueOnce(1_250)
    .mockReturnValueOnce(2_000)
    .mockReturnValueOnce(2_040)
    .mockReturnValueOnce(3_000)
    .mockReturnValueOnce(3_005);
  const observer = vi.fn();

  await expect(
    runWriteBehind('market-test', 3, async () => ({ succeeded: 3, written: 12 }), observer),
  ).resolves.toBeUndefined();
  await runWriteBehind('market-test', 3, async () => ({ succeeded: 2, written: 7 }), observer);
  await runWriteBehind('market-test', 3, async () => ({ succeeded: 0, written: 0 }), observer);

  expect(observer.mock.calls).toEqual([
    [{ outcome: 'succeeded', attempted: 3, written: 12, durationMs: 250 }],
    [{ outcome: 'partial', attempted: 3, written: 7, durationMs: 40 }],
    [{ outcome: 'failed', attempted: 3, written: 0, durationMs: 5 }],
  ]);
  expect(errors).not.toHaveBeenCalled();
});

test('logs a throwing persist under its scope and reports it as failed with nothing written', async () => {
  const errors = silenceConsolePrefixes('error', ['[market-test] ']);
  const boom = new Error('database down');
  const observer = vi.fn();

  await expect(
    runWriteBehind(
      'market-test',
      2,
      async () => {
        throw boom;
      },
      observer,
    ),
  ).resolves.toBeUndefined();

  expect(errors.mock.calls).toEqual([['[market-test] write-behind failed', boom]]);
  expect(observer.mock.calls).toEqual([
    [{ outcome: 'failed', attempted: 2, written: 0, durationMs: expect.any(Number) }],
  ]);
});

test('swallows a throwing observer after the writes, and runs without one', async () => {
  const errors = silenceConsolePrefixes('error', ['[market-test] ']);
  const boom = new Error('observer down');
  const persist = vi.fn(async () => ({ succeeded: 1, written: 4 }));

  await expect(
    runWriteBehind('market-test', 1, persist, () => {
      throw boom;
    }),
  ).resolves.toBeUndefined();
  await expect(runWriteBehind('market-test', 1, persist)).resolves.toBeUndefined();

  expect(persist).toHaveBeenCalledTimes(2);
  expect(errors.mock.calls).toEqual([['[market-test] write-behind observer failed', boom]]);
});
