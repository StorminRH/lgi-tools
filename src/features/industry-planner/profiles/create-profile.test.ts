import { expect, test, vi } from 'vitest';
import { emptyProfileDocument } from './profile-document';

const h = vi.hoisted(() => ({ runSerializable: vi.fn() }));
vi.mock('@/db', () => ({ db: {}, runSerializable: h.runSerializable }));

const { createIndustryProfile } = await import('./queries');

const create = () => createIndustryProfile('owner', { id: 'caps', name: 'Capitals', document: emptyProfileDocument() });

test('a create reports whether its row landed, and leaves retrying an overlapping create to runSerializable', async () => {
  h.runSerializable.mockResolvedValueOnce([{ id: 'caps' }]).mockResolvedValueOnce([]);
  await expect(create()).resolves.toBe(true);
  await expect(create()).resolves.toBe(false);
  expect(h.runSerializable).toHaveBeenCalledTimes(2);

  h.runSerializable.mockReset();
  h.runSerializable.mockRejectedValue(Object.assign(new Error('could not serialize access'), { code: '40001' }));
  await expect(create()).rejects.toThrow('could not serialize access');
  expect(h.runSerializable).toHaveBeenCalledTimes(1);
});
