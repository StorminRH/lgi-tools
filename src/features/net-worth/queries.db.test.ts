import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDbTestHarness, seedEveAccount, seedUser } from '@/db/__tests__/support/db-test-harness';
import { user } from '@/db/auth-schema';
import { NET_WORTH_HISTORY_DAYS } from './constants';
import { getNetWorthHistory, upsertNetWorthDay, utcDay } from './queries';
import type { NetWorthDay } from './types';
import { netWorthDays } from './schema';
import { netWorthPurgeContributor } from './purge';

const harness = await createDbTestHarness({
  schema: 'test_net_worth_days',
  tables: ['user', 'account', 'net_worth_days'],
  foreignKeys: [
    { table: 'net_worth_days', column: 'user_id', refTable: 'user', refColumn: 'id', onDelete: 'cascade' },
  ],
  steerDbProxy: true,
  resetBetweenTests: 'truncate',
});

const USER = 'worth-user';
const OTHER = 'other-user';
const RECORDED = new Date('2026-09-27T12:00:00Z');
const DAY_MS = 24 * 60 * 60 * 1000;

const snapshot = (day: string, netWorth: number, liquidIsk = 100): NetWorthDay => ({
  day,
  netWorth,
  liquidIsk,
  pilotsIncluded: 2,
  pilotsTotal: 3,
  pilots: { '9900000001': { netWorth: netWorth - 1, liquidIsk }, '9900000002': { netWorth: 1, liquidIsk: 0 } },
});

const dayBefore = (day: string, n: number) => utcDay(new Date(Date.parse(`${day}T00:00:00Z`) - n * DAY_MS));

async function rowsFor(userId: string) {
  return harness.db.select().from(netWorthDays).where(eq(netWorthDays.userId, userId)).orderBy(netWorthDays.day);
}

describe.skipIf(!harness.reachable)('net_worth_days queries execute against Postgres', () => {
  beforeEach(async () => {
    await seedUser(harness.db, USER);
    await seedUser(harness.db, OTHER);
    for (const characterId of [9900000001, 9900000002, 9900000003]) {
      await seedEveAccount(harness.db, { id: `account-${characterId}`, characterId, userId: USER });
    }
  });

  it('inserts today once and lets the last write of the day win', async () => {
    await upsertNetWorthDay(USER, snapshot('2026-09-27', 1_000), RECORDED);
    await upsertNetWorthDay(USER, snapshot('2026-09-27', 1_000), RECORDED);
    const later = new Date(RECORDED.getTime() + 60_000);
    await upsertNetWorthDay(USER, snapshot('2026-09-27', 1_250, 300), later);

    expect(await rowsFor(USER)).toEqual([
      {
        userId: USER,
        day: '2026-09-27',
        netWorth: 1_250,
        liquidIsk: 300,
        pilotsIncluded: 2,
        pilotsTotal: 3,
        pilots: { '9900000001': { netWorth: 1_249, liquidIsk: 300 }, '9900000002': { netWorth: 1, liquidIsk: 0 } },
        recordedAt: later,
      },
    ]);
  });

  it('keeps exactly the newest 365 days for the user and leaves other users alone', async () => {
    const today = '2026-09-27';
    const seeded = Array.from({ length: NET_WORTH_HISTORY_DAYS + 9 }, (_, i) => dayBefore(today, i + 1));
    await harness.db.insert(netWorthDays).values(
      seeded.map((day) => ({
        userId: USER, day, netWorth: 1, liquidIsk: 1, pilotsIncluded: 1, pilotsTotal: 1, pilots: {}, recordedAt: RECORDED,
      })),
    );
    await harness.db.insert(netWorthDays).values({
      userId: OTHER, day: dayBefore(today, 400), netWorth: 7, liquidIsk: 7, pilotsIncluded: 1, pilotsTotal: 1, pilots: {}, recordedAt: RECORDED,
    });

    await upsertNetWorthDay(USER, snapshot(today, 42), RECORDED);

    const rows = await rowsFor(USER);
    expect(rows).toHaveLength(NET_WORTH_HISTORY_DAYS);
    expect(rows[0]?.day).toBe(dayBefore(today, NET_WORTH_HISTORY_DAYS - 1));
    expect(rows.at(-1)?.day).toBe(today);
    expect(await rowsFor(OTHER)).toHaveLength(1);
  });

  it('prunes even when today was already recorded', async () => {
    const today = '2026-09-27';
    const seeded = Array.from({ length: NET_WORTH_HISTORY_DAYS + 2 }, (_, i) => dayBefore(today, i));
    await harness.db.insert(netWorthDays).values(
      seeded.map((day) => ({
        userId: USER, day, netWorth: 1, liquidIsk: 1, pilotsIncluded: 1, pilotsTotal: 1, pilots: {}, recordedAt: RECORDED,
      })),
    );

    await upsertNetWorthDay(USER, snapshot(today, 5), RECORDED);

    const rows = await rowsFor(USER);
    expect(rows).toHaveLength(NET_WORTH_HISTORY_DAYS);
    expect(rows.at(-1)).toMatchObject({ day: today, netWorth: 5 });
  });

  it('reads history oldest first with gaps preserved', async () => {
    await upsertNetWorthDay(USER, snapshot('2026-09-20', 10), RECORDED);
    await upsertNetWorthDay(USER, snapshot('2026-09-27', 30), RECORDED);
    await upsertNetWorthDay(USER, snapshot('2026-09-24', 20), RECORDED);

    expect((await getNetWorthHistory(USER)).map((row) => [row.day, row.netWorth])).toEqual([
      ['2026-09-20', 10],
      ['2026-09-24', 20],
      ['2026-09-27', 30],
    ]);
    expect(await getNetWorthHistory('nobody')).toEqual([]);
  });

  it('cascades away with the user row', async () => {
    await upsertNetWorthDay(USER, snapshot('2026-09-27', 10), RECORDED);

    await harness.db.delete(user).where(eq(user.id, USER));

    expect(await rowsFor(USER)).toEqual([]);
  });

  it.each(['unlink', 'transfer'] as const)('does not recreate erased history when an in-flight snapshot waits behind %s', async (operation) => {
    const captured = snapshot('2026-09-27', 900);
    await upsertNetWorthDay(USER, captured, RECORDED);
    const blocker = await harness.sql.reserve();
    let writer: Promise<void> | undefined;
    try {
      await blocker`BEGIN`;
      await blocker`SET LOCAL idle_in_transaction_session_timeout = '10s'`;
      if (operation === 'unlink') {
        await blocker`DELETE FROM account WHERE account_id = '9900000001'`;
      } else {
        await blocker`UPDATE account SET user_id = ${OTHER} WHERE account_id = '9900000001'`;
      }
      const [holder] = await blocker<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      writer = upsertNetWorthDay(USER, captured, RECORDED);
      // Prove the writer reached its ownership fence before committing the removal.
      await expect.poll(async () => {
        const [row] = await harness.sql<{ count: number }[]>`
          SELECT count(*)::integer AS count FROM pg_stat_activity
          WHERE ${holder!.pid} = ANY(pg_blocking_pids(pid))
        `;
        return row?.count;
      }, { timeout: 3_000, interval: 20 }).toBe(1);
      await blocker`COMMIT`;
      await netWorthPurgeContributor.purgeCharacter!({ kind: 'character', userId: USER, characterId: 9900000001 });
      await writer;
      expect(await rowsFor(USER)).toEqual([]);
      // A snapshot already captured before the unlink also stays rejected later.
      await upsertNetWorthDay(USER, captured, RECORDED);
      expect(await rowsFor(USER)).toEqual([]);
    } finally {
      await blocker`ROLLBACK`;
      blocker.release();
      await writer;
    }
  });

  it('erases every day containing an unlinked pilot while preserving other days and accounts', async () => {
    await upsertNetWorthDay(USER, snapshot('2026-09-25', 10), RECORDED);
    await upsertNetWorthDay(USER, snapshot('2026-09-26', 20), RECORDED);
    const unrelated = { ...snapshot('2026-09-27', 30), pilots: { '9900000003': { netWorth: 30, liquidIsk: 100 } } };
    await upsertNetWorthDay(USER, unrelated, RECORDED);
    await harness.db.insert(netWorthDays).values({ userId: OTHER, ...snapshot('2026-09-25', 40), recordedAt: RECORDED });

    await netWorthPurgeContributor.purgeCharacter!({ kind: 'character', userId: USER, characterId: 9900000001 });

    expect(await getNetWorthHistory(USER)).toEqual([unrelated]);
    expect(await getNetWorthHistory(OTHER)).toEqual([snapshot('2026-09-25', 40)]);
    await netWorthPurgeContributor.purgeCharacter!({ kind: 'character', userId: USER, characterId: 9900000001 });
    expect(await getNetWorthHistory(USER)).toEqual([unrelated]);
  });
});

describe('utcDay', () => {
  it('formats the UTC calendar day', () => {
    expect(utcDay(new Date('2026-09-27T23:59:59Z'))).toBe('2026-09-27');
    expect(utcDay(new Date('2026-09-27T00:00:00Z'))).toBe('2026-09-27');
  });
});
