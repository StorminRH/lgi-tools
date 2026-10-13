import { eq, type SQL } from 'drizzle-orm';
import { doublePrecision, integer, jsonb, PgDialect, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { expect, test, vi } from 'vitest';

const h = vi.hoisted(() => ({ runSerializable: vi.fn() }));
vi.mock('./index', () => ({ runSerializable: h.runSerializable }));

const { insertWithinCap } = await import('./capped-insert');

const stock = pgTable('stock', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  quantity: integer('quantity').notNull(),
  ratio: doublePrecision('ratio'),
  detail: jsonb('detail').$type<{ tags: string[] }>(),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

const insertStock = () =>
  insertWithinCap({
    table: stock,
    values: { detail: { tags: ['ore'] }, quantity: 3, ratio: null, note: undefined, ownerId: 'pilot', id: 'row-1' },
    scope: eq(stock.ownerId, 'pilot'),
    cap: 5,
  });

function sentStatement(call: number): { sql: string; params: unknown[] } {
  const { sql, params } = new PgDialect().sqlToQuery(h.runSerializable.mock.calls[call]?.[0] as SQL);
  return { sql: sql.replace(/\s+/g, ' ').trim(), params };
}

test('one statement inserts the row only while the scope is under the cap, casting every value to its column type', async () => {
  h.runSerializable.mockResolvedValueOnce([{ '?column?': 1 }]).mockResolvedValueOnce([]);

  await expect(insertStock()).resolves.toBe(true);
  // Columns follow the table, a null is written, and an undefined value leaves its column to the default.
  expect(sentStatement(0)).toEqual({
    sql:
      'insert into "stock" ("id", "owner_id", "quantity", "ratio", "detail") ' +
      'select $1::text, $2::text, $3::integer, $4::double precision, $5::jsonb ' +
      'where (select count(*) from "stock" where "stock"."owner_id" = $6) < $7 returning 1',
    params: ['row-1', 'pilot', 3, null, '{"tags":["ore"]}', 'pilot', 5],
  });

  await expect(insertStock()).resolves.toBe(false);

  // runSerializable already retries a serialization failure; the cap adds no second loop around it.
  h.runSerializable.mockReset();
  h.runSerializable.mockRejectedValue(Object.assign(new Error('could not serialize access'), { code: '40001' }));
  await expect(insertStock()).rejects.toThrow('could not serialize access');
  expect(h.runSerializable).toHaveBeenCalledTimes(1);
});
