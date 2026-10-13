import { expect, test, vi } from 'vitest';
import { memoizeAsync, shareInFlight, singleFlight } from './memoize';

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

test('memoizeAsync calls through once per argument for the life of the wrapper, sharing a rejection', async () => {
  const pending = Promise.withResolvers<string>();
  const load = vi.fn((id: number) => (id === 1 ? pending.promise : Promise.resolve(`row ${id}`)));
  const readOnce = memoizeAsync(load);

  const a = readOnce(1);
  const b = readOnce(1);
  const c = readOnce(2);
  expect(load.mock.calls).toEqual([[1], [2]]);

  pending.resolve('row 1');
  await expect(Promise.all([a, b, c])).resolves.toEqual(['row 1', 'row 1', 'row 2']);
  await expect(readOnce(1)).resolves.toBe('row 1');
  expect(load).toHaveBeenCalledTimes(2);

  const failure = new Error('read failed');
  const failing = vi.fn((_id: number) => Promise.reject(failure));
  const failOnce = memoizeAsync(failing);
  await expect(failOnce(7)).rejects.toBe(failure);
  await expect(failOnce(7)).rejects.toBe(failure);
  expect(failing).toHaveBeenCalledOnce();

  const fresh = memoizeAsync(load);
  await expect(fresh(1)).resolves.toBe('row 1');
  expect(load).toHaveBeenCalledTimes(3);
});

test('shareInFlight shares a pending start in the caller\'s map, keeps nothing once it settles, and hands a rejection to every caller', async () => {
  const inFlight = new Map<string, Promise<string>>();
  const pending = Promise.withResolvers<string>();
  const start = vi.fn(() => pending.promise);

  const a = shareInFlight(inFlight, 'read', start);
  const b = shareInFlight(inFlight, 'read', vi.fn(() => Promise.resolve('never asked')));
  expect(start).toHaveBeenCalledOnce();
  expect([...inFlight.keys()]).toEqual(['read']);

  pending.resolve('rows');
  await expect(Promise.all([a, b])).resolves.toEqual(['rows', 'rows']);
  expect(inFlight.size).toBe(0);

  const failure = new Error('offline');
  const failing = Promise.withResolvers<string>();
  const c = shareInFlight(inFlight, 'read', () => failing.promise);
  const d = shareInFlight(inFlight, 'read', start);
  failing.reject(failure);
  await expect(c).rejects.toBe(failure);
  await expect(d).rejects.toBe(failure);
  expect(inFlight.size).toBe(0);
  expect(start).toHaveBeenCalledOnce();
});

test('shareInFlight leaves an entry the caller replaced while the first was in flight', async () => {
  const inFlight = new Map<string, Promise<string>>();
  const first = Promise.withResolvers<string>();
  const request = shareInFlight(inFlight, 'read', () => first.promise);
  const replacement = Promise.resolve('newer');
  inFlight.set('read', replacement);

  first.resolve('older');
  await expect(request).resolves.toBe('older');
  expect(inFlight.get('read')).toBe(replacement);
});
