import { desc, inArray } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import { listRecentDomainEvents } from './queries';
import { domainEvents } from './schema';
import { DOMAIN_EVENT_TYPES } from './types';

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
      { id: 5, occurredAt: new Date('2026-07-10T08:00:00Z'), eventType: 'eve_token_state_changed', metadata: tokenChange(1) },
      { id: 2, occurredAt: TIED_AT, eventType: 'eve_token_state_changed', metadata: tokenChange(2) },
      { id: 9, occurredAt: TIED_AT, eventType: 'eve_token_state_changed', metadata: tokenChange(3) },
      { id: 4, occurredAt: new Date('2026-07-15T00:00:00Z'), eventType: 'eve_token_state_changed', metadata: tokenChange(4) },
      { id: 7, occurredAt: TIED_AT, eventType: 'eve_token_state_changed', metadata: tokenChange(5) },
      { id: 1, occurredAt: new Date('2025-01-01T00:00:00Z'), eventType: 'eve_token_state_changed', metadata: tokenChange(6) },
      // Retired types the old ESI queue and budget guard wrote; they stay
      // stored until retention prunes them.
      { id: 10, occurredAt: new Date('2026-07-16T00:00:00Z'), eventType: 'esi_refresh_job_status_changed', metadata: tokenChange(7) },
      { id: 3, occurredAt: TIED_AT, eventType: 'esi_budget_guard_exhausted', metadata: tokenChange(8) },
    ]);
  });

  it('returns the same page as plain descending order on both keys', async () => {
    const reference = await harness.db
      .select()
      .from(domainEvents)
      .where(inArray(domainEvents.eventType, [...DOMAIN_EVENT_TYPES]))
      .orderBy(desc(domainEvents.occurredAt), desc(domainEvents.id));

    for (const limit of [1, 3, 4, 30]) {
      await expect(listRecentDomainEvents(limit)).resolves.toEqual(reference.slice(0, limit));
    }
    expect((await listRecentDomainEvents(30)).map((row) => row.id)).toEqual([4, 9, 7, 2, 5, 1]);
  });

  it('skips stored rows of a retired event type', async () => {
    const types = (await listRecentDomainEvents(30)).map((row) => row.eventType);
    expect(types).not.toContain('esi_refresh_job_status_changed');
    expect(types).not.toContain('esi_budget_guard_exhausted');
    expect((await listRecentDomainEvents(1)).map((row) => row.id)).toEqual([4]);
  });
});

function tokenChange(characterId: number) {
  return {
    characterId,
    from: 'usable' as const,
    to: 'suspect' as const,
    reason: 'invalid_grant' as const,
  };
}
