import { afterEach, expect, test, vi } from 'vitest';
import { silenceConsolePrefixes } from '@/lib/__tests__/console-tags';
import { bestEffort } from './best-effort';

afterEach(() => {
  vi.restoreAllMocks();
});

test('awaits a side effect that succeeds and logs nothing', async () => {
  const errors = vi.spyOn(console, 'error');
  let landed = false;
  await bestEffort('test', 'write', 'user-1', async () => {
    await Promise.resolve();
    landed = true;
  });
  expect(landed).toBe(true);
  expect(errors).not.toHaveBeenCalled();
});

test('logs a rejection or a synchronous throw, naming the subject only when given, and resolves', async () => {
  const errors = silenceConsolePrefixes('error', ['[test] ']);
  const down = new Error('discord down');
  const threw = new Error('mock threw');

  await expect(bestEffort('test', 'alert', null, () => Promise.reject(down))).resolves.toBeUndefined();
  await expect(bestEffort('test', 'alert', 'job 7', () => Promise.reject(down))).resolves.toBeUndefined();
  await expect(
    bestEffort('test', 'alert', null, () => {
      throw threw;
    }),
  ).resolves.toBeUndefined();

  expect(errors.mock.calls).toEqual([
    ['[test] alert failed', down],
    ['[test] alert failed for job 7', down],
    ['[test] alert failed', threw],
  ]);
});
