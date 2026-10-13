import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { runSerializable, Sql } from '@/db';

type RunSerializable = typeof runSerializable;

const dialect = new PgDialect();
let standIn: RunSerializable | undefined;

/**
 * For a suite's `vi.mock('@/db', ...)`: the module as it is, except that
 * runSerializable hands its statement to whatever stand-in a helper below has
 * installed, and to the real one otherwise.
 */
export function routeRunSerializable<TModule extends { runSerializable: RunSerializable }>(actual: TModule): TModule {
  return { ...actual, runSerializable: (query: SQL) => (standIn ?? actual.runSerializable)(query) };
}

async function withStandIn<T>(run: RunSerializable, body: () => Promise<T>): Promise<T> {
  standIn = run;
  try {
    return await body();
  } finally {
    standIn = undefined;
  }
}

/** The plan Postgres picks for the statement `write` hands runSerializable. The statement itself never runs. */
export async function explainSerializable(sql: Sql, write: () => Promise<unknown>): Promise<string> {
  let plan = '';
  await withStandIn(async (query) => {
    const { sql: text, params } = dialect.sqlToQuery(query);
    const rows = await sql.unsafe(`explain (costs off) ${text}`, params as never[]);
    plan = rows.map((row) => String(row['QUERY PLAN'])).join('\n');
    return [];
  }, write);
  return plan;
}

const settle = <T>(promise: Promise<T>): Promise<PromiseSettledResult<T>> =>
  promise.then(
    (value) => ({ status: 'fulfilled', value }),
    (reason: unknown) => ({ status: 'rejected', reason }),
  );

/**
 * Runs `writes` with their serializable transactions overlapping as far as
 * they can: each statement runs in a transaction of its own that stays open
 * until every statement has run, and the transactions then commit one by one
 * in the order their statements arrived. Each write gets that one attempt and
 * no retry, so a serialization failure reaches its result as a rejection.
 * Each open transaction holds one of `sql`'s connections, so `writes` must
 * not outnumber them or the last statement waits for a connection forever.
 */
export async function overlapSerializable<T>(
  sql: Sql,
  writes: readonly (() => Promise<T>)[],
): Promise<PromiseSettledResult<T>[]> {
  const ran = writes.map(() => Promise.withResolvers<void>());
  const commit = writes.map(() => Promise.withResolvers<void>());
  const transactions: Promise<unknown>[] = [];
  return withStandIn((query) => {
    const turn = transactions.length;
    const { sql: text, params } = dialect.sqlToQuery(query);
    const transaction = sql.begin('isolation level serializable', async (tx) => {
      const rows = await tx.unsafe(text, params as never[]).finally(() => ran[turn]?.resolve());
      await commit[turn]?.promise;
      return rows;
    });
    transactions.push(settle(transaction));
    return transaction;
  }, async () => {
    const results = writes.map((write) => settle(write()));
    await Promise.all(ran.map(({ promise }) => promise));
    for (const [turn, transaction] of transactions.entries()) {
      commit[turn]?.resolve();
      await transaction;
    }
    return Promise.all(results);
  });
}

/** A table whose creates insertWithinCap caps per account, as a cap race needs it. */
export interface CappedTable {
  /** The table's name in the suite's schema. */
  readonly table: string;
  readonly cap: number;
  /** Stores rows straight into the table, past the cap. */
  readonly seed: (rows: readonly { id: string; userId: string }[]) => Promise<void>;
  /** The capped create, as its route calls it. */
  readonly create: (userId: string, id: string) => Promise<boolean>;
}

const FILLER_ACCOUNTS = 1000;

/**
 * Runs the cap's races on a table holding one row for each of a thousand
 * accounts, enough that its user index spans several leaf pages and the
 * planner reaches for it. Reports the plan of the cap's statement, two
 * accounts creating at once, one account's two creates racing for its last
 * slot, and the first race again once the user index is dropped.
 */
export async function raceCappedCreates(sql: Sql, capped: CappedTable) {
  await capped.seed(
    Array.from({ length: FILLER_ACCOUNTS }, (_, i) => ({
      id: `filler-${i}`,
      userId: `filler-${String(i).padStart(4, '0')}`,
    })),
  );
  await sql.unsafe(`analyze "${capped.table}"`);
  const plan = await explainSerializable(sql, () => capped.create('a-pilot', 'a-probe'));
  // 'a-' sorts before every filler account and 'z-' after them, so the two
  // accounts' index entries sit on different leaf pages.
  const twoAccounts = await overlapSerializable(sql, [
    () => capped.create('a-pilot', 'a-1'),
    () => capped.create('z-pilot', 'z-1'),
  ]);
  await capped.seed(Array.from({ length: capped.cap - 2 }, (_, i) => ({ id: `z-fill-${i}`, userId: 'z-pilot' })));
  const lastSlot = await overlapSerializable(sql, [
    () => capped.create('z-pilot', 'z-last-a'),
    () => capped.create('z-pilot', 'z-last-b'),
  ]);
  const [stored] = await sql.unsafe<{ rows: number }[]>(
    `select count(*)::integer as rows from "${capped.table}" where user_id = 'z-pilot'`,
  );
  const [userIndex] = await sql<{ indexname: string }[]>`
    select indexname from pg_indexes
    where schemaname = current_schema() and tablename = ${capped.table} and indexdef like '%(user_id)%'`;
  await sql.unsafe(`drop index "${userIndex?.indexname}"`);
  const withoutIndex = await overlapSerializable(sql, [
    () => capped.create('b-pilot', 'b-1'),
    () => capped.create('y-pilot', 'y-1'),
  ]);
  return { plan, twoAccounts, lastSlot, lastSlotRows: stored?.rows, withoutIndex };
}
