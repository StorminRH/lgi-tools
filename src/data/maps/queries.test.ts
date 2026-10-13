import { beforeEach, expect, test, vi } from 'vitest';
import type { AnyPgDb } from '@/lib/db-types';

const h = vi.hoisted(() => ({
  db: {
    execute: vi.fn(),
    transaction: vi.fn(() => {
      throw new Error('The HTTP driver does not support transactions');
    }),
  },
  transactionContext: { execute: vi.fn() },
  directTransaction: vi.fn(),
  directDatabase: vi.fn(),
}));

vi.mock('@/db', () => ({ db: h.db }));
vi.mock('@/db/direct-database', () => ({ directDatabase: h.directDatabase }));

import { applyAuthorizedMapGrantChange } from './queries';

const PRINCIPALS = { characterIds: [], corporationIds: [] };
const REVOKE = {
  operation: 'revoke' as const,
  principal: { ownerType: 'corporation' as const, ownerId: 99 },
};
const PENDING = { mapId: 'map-1', version: 'captured' };

beforeEach(() => {
  vi.clearAllMocks();
  h.directDatabase.mockReturnValue({ transaction: h.directTransaction });
  h.directTransaction.mockImplementation((run: (transaction: typeof h.transactionContext) => Promise<unknown>) =>
    run(h.transactionContext));
  h.transactionContext.execute.mockReset().mockResolvedValueOnce([]).mockResolvedValueOnce([PENDING]);
  h.db.execute.mockReset().mockResolvedValue([PENDING]);
});

test('default revokes use the direct client when the HTTP database cannot transact', async () => {
  await expect(applyAuthorizedMapGrantChange('admin', PRINCIPALS, 'map-1', REVOKE))
    .resolves.toEqual(PENDING);
  expect(h.directDatabase).toHaveBeenCalledOnce();
  expect(h.directTransaction).toHaveBeenCalledOnce();
  expect(h.db.transaction).not.toHaveBeenCalled();
});

test('revokes retain an explicitly injected transaction-capable database', async () => {
  const execute = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([PENDING]);
  const database = {
    transaction: async (run: (transaction: { execute: typeof execute }) => Promise<unknown>) => run({ execute }),
  } as unknown as AnyPgDb;
  await expect(applyAuthorizedMapGrantChange('admin', PRINCIPALS, 'map-1', REVOKE, database))
    .resolves.toEqual(PENDING);
  expect(h.directDatabase).not.toHaveBeenCalled();
});

test('default upserts keep using the HTTP database without opening a transaction', async () => {
  await expect(applyAuthorizedMapGrantChange('admin', PRINCIPALS, 'map-1', {
    operation: 'upsert',
    grant: { ownerType: 'character', ownerId: 7, role: 'editor' },
  })).resolves.toEqual(PENDING);
  expect(h.directDatabase).not.toHaveBeenCalled();
  expect(h.db.transaction).not.toHaveBeenCalled();
});
