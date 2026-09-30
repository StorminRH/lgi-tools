import { asc, lt } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { pruneStaleMarketHistory } from '@/data/market-history/ingest';
import { marketHistory, marketHistoryMeta } from '@/data/market-history/schema';
import { deleteInBatches } from '@/lib/batched-delete';
import { pruneExpiredSessions } from '@/platform/auth/verification-retention';
import { session, verification } from '@/db/auth-schema';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';

const harness = await createDbTestHarness({
  schema: 'test_housekeeping',
  tables: ['session', 'verification', 'market_history', 'market_history_meta'],
});
const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-07-14T12:00:00Z');

function day(offsetDays: number): string {
  return new Date(NOW.getTime() + offsetDays * DAY_MS).toISOString().slice(0, 10);
}

function historyRow(typeId: number, date: string) {
  return { typeId, date, average: 1, highest: 1, lowest: 1, volume: BigInt(1), orderCount: 1 };
}

describe.skipIf(!harness.reachable)('housekeeping deletes execute against Postgres', () => {
  beforeEach(async () => {
    await harness.db.delete(session);
    await harness.db.delete(verification);
    await harness.db.delete(marketHistory);
    await harness.db.delete(marketHistoryMeta);
  });

  it('deletes in batches until none remain, and stops unfinished at the deadline', async () => {
    const expired = new Date(NOW.getTime() - 2 * DAY_MS);
    const rows = Array.from({ length: 5 }, (_, i) => ({
      id: `v-${i}`,
      identifier: 'oauth-state',
      value: `v-${i}`,
      expiresAt: expired,
    }));
    const past = lt(verification.expiresAt, NOW);

    await harness.db.insert(verification).values(rows);
    await expect(deleteInBatches(harness.db, verification, past, Date.now() - 1, 2)).resolves.toEqual({
      deleted: 2,
      finished: false,
    });
    await expect(deleteInBatches(harness.db, verification, past, Number.POSITIVE_INFINITY, 2)).resolves.toEqual({
      deleted: 3,
      finished: true,
    });
    expect(await harness.db.select().from(verification)).toEqual([]);
  });

  it('deletes sessions a day past expiry and keeps the rest', async () => {
    const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs);
    await harness.db.insert(session).values([
      { id: 'abandoned', token: 't-1', userId: 'u', expiresAt: at(-2 * DAY_MS) },
      { id: 'recently-expired', token: 't-2', userId: 'u', expiresAt: at(-DAY_MS / 2) },
      { id: 'live', token: 't-3', userId: 'u', expiresAt: at(DAY_MS) },
    ]);

    await expect(pruneExpiredSessions(harness.db, 1, NOW)).resolves.toEqual({ deleted: 1, finished: true });
    const remaining = await harness.db.select({ id: session.id }).from(session).orderBy(asc(session.id));
    expect(remaining).toEqual([{ id: 'live' }, { id: 'recently-expired' }]);
  });

  it('trims history older than the retention window for types that no longer refresh', async () => {
    await harness.db.insert(marketHistoryMeta).values([
      { typeId: 34, updatedAt: new Date(NOW.getTime() - 3 * DAY_MS), staleAfter: NOW, source: 'esi' },
      { typeId: 35, updatedAt: new Date(NOW.getTime() - 60_000), staleAfter: NOW, source: 'esi' },
    ]);
    await harness.db.insert(marketHistory).values([
      historyRow(34, day(-401)),
      historyRow(34, day(-399)),
      historyRow(35, day(-401)),
    ]);

    await expect(pruneStaleMarketHistory(harness.db, NOW)).resolves.toEqual({ deleted: 1, finished: true });
    const remaining = await harness.db
      .select({ typeId: marketHistory.typeId, date: marketHistory.date })
      .from(marketHistory)
      .orderBy(asc(marketHistory.typeId), asc(marketHistory.date));
    expect(remaining).toEqual([
      { typeId: 34, date: day(-399) },
      { typeId: 35, date: day(-401) },
    ]);
  });
});
