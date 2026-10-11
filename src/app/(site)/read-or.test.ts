import { afterEach, expect, test, vi } from 'vitest';

const { rethrow } = vi.hoisted(() => ({ rethrow: vi.fn() }));
vi.mock('next/navigation', () => ({
  unstable_rethrow: (err: unknown) => rethrow(err),
}));

import { readOr } from './read-or';

afterEach(() => {
  vi.restoreAllMocks();
  rethrow.mockReset();
});

test('readOr passes a read through, and degrades a failed read to the fallback with its message logged', async () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

  expect(await readOr('[map] listing unavailable', async () => ['alpha'], [])).toEqual(['alpha']);
  expect(rethrow).not.toHaveBeenCalled();
  expect(consoleError).not.toHaveBeenCalled();

  const err = new Error('db down');
  const fallback = { rows: [] };
  const degraded = await readOr(
    '[map] listing unavailable',
    async () => {
      throw err;
    },
    fallback,
  );

  expect(degraded).toBe(fallback);
  expect(rethrow).toHaveBeenCalledWith(err);
  expect(consoleError).toHaveBeenCalledWith('[map] listing unavailable', err);
});

test('readOr lets a framework control-flow signal escape without logging it', async () => {
  const signal = new Error('NEXT_REDIRECT');
  rethrow.mockImplementation((err: unknown) => {
    throw err;
  });
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

  await expect(
    readOr(
      '[map] listing unavailable',
      async () => {
        throw signal;
      },
      null,
    ),
  ).rejects.toBe(signal);
  expect(consoleError).not.toHaveBeenCalled();
});
