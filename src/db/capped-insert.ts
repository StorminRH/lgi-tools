import { getTableColumns, sql, type SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { runSerializable } from './index';

/**
 * Inserts one row unless the rows `scope` selects in the same table already
 * number `cap`, and reports whether the row landed. The count and the insert
 * are one statement in a serializable transaction, so no lock is held: of two
 * inserts racing for the last slot, Postgres rejects one, and runSerializable
 * runs it again, when it sees the other's row and finds no room. The retry
 * lives there, not here.
 *
 * Like Drizzle's own insert, a value left undefined leaves its column to the
 * SQL default; unlike it, no JS-side $defaultFn or $onUpdate runs. Each value
 * is encoded by its column (jsonb is stringified) and cast to the column's SQL
 * type, so no driver has to guess a parameter's type. getSQLType() names a
 * pgEnum unquoted and without its schema, so an enum column would need a
 * quoted, qualified cast before it could be written here.
 */
export async function insertWithinCap<TTable extends PgTable>(input: {
  readonly table: TTable;
  readonly values: TTable['$inferInsert'];
  readonly scope: SQL;
  readonly cap: number;
}): Promise<boolean> {
  const values: Record<string, unknown> = input.values;
  const written = Object.entries(getTableColumns(input.table)).filter(
    ([key]) => values[key] !== undefined,
  );
  const names = written.map(([, column]) => sql.identifier(column.name));
  const params = written.map(
    ([key, column]) => sql`${sql.param(values[key], column)}::${sql.raw(column.getSQLType())}`,
  );
  const inserted = await runSerializable(sql`
    insert into ${input.table} (${sql.join(names, sql`, `)})
    select ${sql.join(params, sql`, `)}
    where (select count(*) from ${input.table} where ${input.scope}) < ${input.cap}
    returning 1`);
  return inserted.length > 0;
}
