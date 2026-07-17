import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnyPgDb } from '@/lib/db-types';
import { EsiBudgetExhaustedError } from '@/lib/esi';

const mocks = vi.hoisted(() => ({
  advancePendingWorkSignal: vi.fn(async () => {}),
}));
vi.mock('./pending-signal', () => ({
  advancePendingWorkSignal: mocks.advancePendingWorkSignal,
}));

import { enqueueEsiRefreshJob } from './queries';

const NOW = new Date('2026-07-14T12:00:00Z');
const input = {
  dataset: 'skills' as const,
  userId: 'user-1',
  target: { ownerType: 'character' as const, ownerId: 1001 },
  error: new EsiBudgetExhaustedError(
    11,
    'rate_limited',
    900,
    '/characters/1001/skills/',
  ),
};

function fakeDatabase(insertedId: number | null, existingId: number | null) {
  const returning = vi
    .fn()
    .mockResolvedValue(insertedId === null ? [] : [{ id: insertedId }]);
  const onConflictDoNothing = vi.fn(() => ({ returning }));
  const values = vi.fn(() => ({ onConflictDoNothing }));
  const insert = vi.fn(() => ({ values }));
  const limit = vi
    .fn()
    .mockResolvedValue(
      existingId === null ? [] : [{ id: existingId, nextAttemptAt: NOW }],
    );
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  return {
    database: { insert, select } as unknown as AnyPgDb,
    insert,
    select,
    values,
  };
}

describe('enqueueEsiRefreshJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stores the exact owner, resource, budget metadata, and retry deadline', async () => {
    const fake = fakeDatabase(41, null);

    await expect(enqueueEsiRefreshJob(input, NOW, fake.database)).resolves.toBe(41);

    expect(fake.values).toHaveBeenCalledWith({
      dataset: 'skills',
      userId: 'user-1',
      ownerType: 'character',
      ownerId: 1001,
      resource: '/characters/1001/skills/',
      idempotencyKey:
        'skills|user-1|character|1001|/characters/1001/skills/',
      status: 'deferred_for_budget',
      nextAttemptAt: new Date('2026-07-14T12:15:00Z'),
      budgetReason: 'rate_limited',
      budgetRemaining: 11,
      retryAfterSeconds: 900,
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(fake.select).not.toHaveBeenCalled();
    expect(mocks.advancePendingWorkSignal).toHaveBeenCalledWith(
      new Date('2026-07-14T12:15:00Z'),
    );
  });

  it('returns the existing live job when the unique key coalesces an insert', async () => {
    const fake = fakeDatabase(null, 42);

    await expect(enqueueEsiRefreshJob(input, NOW, fake.database)).resolves.toBe(42);

    expect(fake.insert).toHaveBeenCalledOnce();
    expect(fake.select).toHaveBeenCalledOnce();
    expect(mocks.advancePendingWorkSignal).toHaveBeenCalledWith(NOW);
  });

  it('fails loudly if a coalesced row is no longer live', async () => {
    const fake = fakeDatabase(null, null);

    await expect(enqueueEsiRefreshJob(input, NOW, fake.database)).rejects.toThrow(
      'ESI refresh job coalesced without a live row',
    );
  });
});
