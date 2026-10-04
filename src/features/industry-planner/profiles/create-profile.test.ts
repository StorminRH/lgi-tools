import { beforeEach, expect, test, vi } from 'vitest';
import { emptyProfileDocument } from './profile-document';

const h = vi.hoisted(() => ({ runSerializable: vi.fn() }));
vi.mock('@/db', () => ({ db: {}, runSerializable: h.runSerializable }));

const { createIndustryProfile } = await import('./queries');

const failWith = (message: string, code?: string) => async () => {
  throw Object.assign(new Error(message), { code });
};
const create = () => createIndustryProfile('owner', { id: 'caps', name: 'Capitals', document: emptyProfileDocument() });

beforeEach(() => {
  h.runSerializable.mockReset();
});

test('a create that overlapped another runs again, and then saves or finds the account full', async () => {
  h.runSerializable.mockImplementationOnce(failWith('could not serialize access', '40001')).mockResolvedValueOnce([{ id: 'caps' }]);
  await expect(create()).resolves.toBe(true);
  h.runSerializable.mockImplementationOnce(failWith('could not serialize access', '40001')).mockResolvedValueOnce([]);
  await expect(create()).resolves.toBe(false);
  expect(h.runSerializable).toHaveBeenCalledTimes(4);
});

test('a create that keeps overlapping gives up after three attempts', async () => {
  h.runSerializable.mockImplementation(failWith('could not serialize access', '40001'));
  await expect(create()).rejects.toThrow('could not serialize access');
  expect(h.runSerializable).toHaveBeenCalledTimes(3);
});

test('any other failure is not retried', async () => {
  h.runSerializable.mockImplementation(failWith('offline'));
  await expect(create()).rejects.toThrow('offline');
  expect(h.runSerializable).toHaveBeenCalledTimes(1);
});
