import { afterEach, expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({ sleep: vi.fn(async (_ms: number) => {}) }));
vi.mock('@/lib/retry', () => ({ sleep: h.sleep }));

const { retrySerializationFailures } = await import('./serialization-retry');

const pgError = (message: string, code: string) => Object.assign(new Error(message), { code });
const serializationFailure = (message = 'could not serialize access') => pgError(message, '40001');
const pauses = () => h.sleep.mock.calls.map(([ms]) => ms);

afterEach(() => {
  vi.restoreAllMocks();
  h.sleep.mockClear();
});

test('a statement rejected by a concurrent write runs again after a short pause, and its result comes back', async () => {
  const attempt = vi
    .fn()
    .mockRejectedValueOnce(serializationFailure())
    .mockRejectedValueOnce(new Error('query failed', { cause: serializationFailure() }))
    .mockResolvedValueOnce([{ id: 'caps' }]);
  await expect(retrySerializationFailures(attempt)).resolves.toEqual([{ id: 'caps' }]);
  expect(attempt).toHaveBeenCalledTimes(3);
  const [first, second] = pauses();
  expect(first).toBeGreaterThanOrEqual(5);
  expect(first).toBeLessThan(25);
  expect(second).toBeGreaterThanOrEqual(10);
  expect(second).toBeLessThan(50);
});

test('each pause is a random 5-25 ms scaled by how many tries have failed', async () => {
  vi.spyOn(Math, 'random').mockReturnValue(0);
  const shortest = vi.fn().mockRejectedValueOnce(serializationFailure()).mockRejectedValueOnce(serializationFailure()).mockResolvedValue('ok');
  await retrySerializationFailures(shortest);
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  const middle = vi.fn().mockRejectedValueOnce(serializationFailure()).mockRejectedValueOnce(serializationFailure()).mockResolvedValue('ok');
  await retrySerializationFailures(middle);
  expect(pauses()).toEqual([5, 10, 15, 30]);
});

test('ten rejected tries in a row give up and rethrow the last failure', async () => {
  let tries = 0;
  const attempt = vi.fn(async () => {
    tries++;
    throw serializationFailure(`could not serialize access (try ${tries})`);
  });
  await expect(retrySerializationFailures(attempt)).rejects.toThrow('could not serialize access (try 10)');
  expect(attempt).toHaveBeenCalledTimes(10);
  expect(h.sleep).toHaveBeenCalledTimes(9);
});

test('any other failure reaches the caller at once without another try', async () => {
  const offline = vi.fn().mockRejectedValue(new Error('offline'));
  await expect(retrySerializationFailures(offline)).rejects.toThrow('offline');
  expect(offline).toHaveBeenCalledTimes(1);

  const duplicate = vi.fn().mockRejectedValue(pgError('duplicate key', '23505'));
  await expect(retrySerializationFailures(duplicate)).rejects.toThrow('duplicate key');
  expect(duplicate).toHaveBeenCalledTimes(1);
  expect(h.sleep).not.toHaveBeenCalled();
});
