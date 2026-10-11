import { expect, test, vi } from 'vitest';
import { singleFlight } from './memoize';

test('singleFlight shares one load per key while it is in flight and loads again once it settles', async () => {
  const first = Promise.withResolvers<string>();
  const other = Promise.withResolvers<string>();
  const load = vi.fn((key: number) => (key === 7 ? first.promise : other.promise));
  const loadOnce = singleFlight(load);

  const a = loadOnce(7);
  const b = loadOnce(7);
  const c = loadOnce(8);
  expect(load.mock.calls).toEqual([[7], [8]]);

  first.resolve('seven');
  other.resolve('eight');
  await expect(Promise.all([a, b, c])).resolves.toEqual(['seven', 'seven', 'eight']);

  load.mockResolvedValueOnce('seven again');
  await expect(loadOnce(7)).resolves.toBe('seven again');
  expect(load).toHaveBeenCalledTimes(3);
});

test('singleFlight hands one rejection to every concurrent caller and does not cache it', async () => {
  const failing = Promise.withResolvers<string>();
  const load = vi.fn((_key: string) => failing.promise);
  const loadOnce = singleFlight(load);

  const a = loadOnce('statics');
  const b = loadOnce('statics');
  const failure = new Error('offline');
  failing.reject(failure);
  await expect(a).rejects.toBe(failure);
  await expect(b).rejects.toBe(failure);
  expect(load).toHaveBeenCalledOnce();

  load.mockResolvedValueOnce('recovered');
  await expect(loadOnce('statics')).resolves.toBe('recovered');
  expect(load).toHaveBeenCalledTimes(2);
});
