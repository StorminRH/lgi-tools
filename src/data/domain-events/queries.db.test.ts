import { desc } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import { listRecentDomainEvents } from './queries';
import { domainEvents } from './schema';

const harness = await createDbTestHarness({
  schema: 'test_domain_events',
  tables: ['domain_events'],
  steerDbProxy: true,
});

const TIED_AT = new Date('2026-07-14T12:00:00Z');

describe.skipIf(!harness.reachable)('domain event ledger reads against Postgres', () => {
  beforeAll(async () => {
    // Out-of-order inserts, shared timestamps and an id gap, so the order has
    // to come from both keys rather than from insertion order.
    await harness.db.insert(domainEvents).values([
      { id: 5, occurredAt: new Date('2026-07-10T08:00:00Z'), eventType: 'esi_budget_guard_exhausted', metadata: budget(1) },
      { id: 2, occurredAt: TIED_AT, eventType: 'esi_budget_guard_exhausted', metadata: budget(2) },
      { id: 9, occurredAt: TIED_AT, eventType: 'esi_budget_guard_exhausted', metadata: budget(3) },
      { id: 4, occurredAt: new Date('2026-07-15T00:00:00Z'), eventType: 'esi_budget_guard_exhausted', metadata: budget(4) },
      { id: 7, occurredAt: TIED_AT, eventType: 'esi_budget_guard_exhausted', metadata: budget(5) },
      { id: 1, occurredAt: new Date('2025-01-01T00:00:00Z'), eventType: 'esi_budget_guard_exhausted', metadata: budget(6) },
    ]);
  });

  it('returns the same page as plain descending order on both keys', async () => {
    const reference = await harness.db
      .select()
      .from(domainEvents)
      .orderBy(desc(domainEvents.occurredAt), desc(domainEvents.id));

    for (const limit of [1, 3, 4, 30]) {
      await expect(listRecentDomainEvents(limit)).resolves.toEqual(reference.slice(0, limit));
    }
    expect((await listRecentDomainEvents(30)).map((row) => row.id)).toEqual([4, 9, 7, 2, 5, 1]);
  });
});

function budget(count: number) {
  return {
    count,
    windowMinutes: 15,
    windowStartedAt: '2026-07-14T12:00:00.000Z',
    windowEndedAt: '2026-07-14T12:15:00.000Z',
  };
}
