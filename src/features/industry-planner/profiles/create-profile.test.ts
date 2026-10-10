import { expect, test, vi } from 'vitest';
import { emptyProfileDocument } from './profile-document';

const h = vi.hoisted(() => ({ runSerializable: vi.fn() }));
vi.mock('@/db', () => ({ db: {}, runSerializable: h.runSerializable }));

const { createIndustryProfile } = await import('./queries');

const failWith = (message: string, code?: string) => async () => {
  throw Object.assign(new Error(message), { code });
};
const create = () => createIndustryProfile('owner', { id: 'caps', name: 'Capitals', document: emptyProfileDocument() });

test('a create that overlapped another runs again, gives up after eight attempts, and does not retry other failures', async () => {
  vi.spyOn(Math, 'random').mockReturnValue(0);
  h.runSerializable.mockImplementationOnce(failWith('could not serialize access', '40001')).mockResolvedValueOnce([{ id: 'caps' }]);
  await expect(create()).resolves.toBe(true);
  h.runSerializable.mockImplementationOnce(failWith('could not serialize access', '40001')).mockResolvedValueOnce([]);
  await expect(create()).resolves.toBe(false);
  expect(h.runSerializable).toHaveBeenCalledTimes(4);

  h.runSerializable.mockReset();
  h.runSerializable.mockImplementation(failWith('could not serialize access', '40001'));
  await expect(create()).rejects.toThrow('could not serialize access');
  expect(h.runSerializable).toHaveBeenCalledTimes(8);

  h.runSerializable.mockReset();
  h.runSerializable.mockImplementation(failWith('offline'));
  await expect(create()).rejects.toThrow('offline');
  expect(h.runSerializable).toHaveBeenCalledTimes(1);
});

test('waits a random pause that grows with each attempt before retrying', async () => {
  vi.useFakeTimers();
  try {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    h.runSerializable.mockReset();
    h.runSerializable
      .mockImplementationOnce(failWith('could not serialize access', '40001'))
      .mockImplementationOnce(failWith('could not serialize access', '40001'))
      .mockResolvedValueOnce([{ id: 'caps' }]);

    const pending = create();
    // Retry 1 waits half of 20 ms, retry 2 half of 40 ms.
    await vi.advanceTimersByTimeAsync(9);
    expect(h.runSerializable).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.runSerializable).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(19);
    expect(h.runSerializable).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toBe(true);
    expect(h.runSerializable).toHaveBeenCalledTimes(3);
  } finally {
    vi.useRealTimers();
  }
});
