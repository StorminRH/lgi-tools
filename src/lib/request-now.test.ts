import { afterEach, expect, test, vi } from 'vitest';

const gate = vi.hoisted(() => ({ release: () => {} }));

vi.mock('next/cache', () => ({
  io: () =>
    new Promise<void>((resolve) => {
      gate.release = resolve;
    }),
}));

import { requestNow } from './request-now';

afterEach(() => {
  vi.useRealTimers();
});

test('the clock is read only once io() lets the render through', async () => {
  vi.useFakeTimers({ now: 1_000 });
  const now = requestNow();
  vi.setSystemTime(2_000);
  gate.release();
  await expect(now).resolves.toBe(2_000);
});
