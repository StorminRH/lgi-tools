import { eq, getTableName, sql, type Table } from 'drizzle-orm';
import { integer, pgTable, text } from 'drizzle-orm/pg-core';
import { expect, test } from 'vitest';
import type { PostgresJsDb } from '@/lib/db-types';
import { createFakeQueryChain } from './fake-query-chain';

const widgets = pgTable('widgets', { id: integer('id').primaryKey(), name: text('name') });
const gadgets = pgTable('gadgets', { id: integer('id').primaryKey() });

function asDatabase(chain: Record<string, unknown>): PostgresJsDb {
  return chain as unknown as PostgresJsDb;
}

test('awaited queries take queued results in order and fall back to whenEmpty only once the queue is empty', async () => {
  const fake = createFakeQueryChain();
  const db = asDatabase(fake.chain);
  fake.state.results = [[{ id: 1, name: 'first' }], undefined];

  expect(await db.select().from(widgets).where(eq(widgets.id, 1))).toEqual([{ id: 1, name: 'first' }]);
  expect(await db.select().from(widgets)).toBeUndefined();
  expect(await db.select().from(widgets)).toEqual([]);
  expect(fake.state.results).toEqual([]);
  expect(fake.state.calls.select).toBe(3);

  const strict = createFakeQueryChain({ whenEmpty: undefined });
  expect(await asDatabase(strict.chain).select().from(widgets)).toBeUndefined();
});

test('a transaction runs on the chain, .for() keeps chaining, and a queued rejection rejects only its own await', async () => {
  const fake = createFakeQueryChain();
  const db = asDatabase(fake.chain);
  const failure = new Error('could not serialize access');
  fake.state.results = [[{ id: 7 }], Promise.reject(failure), [{ id: 8 }]];

  const locked = await db.transaction(async (tx) => {
    expect(tx).toBe(fake.chain);
    return tx.select({ id: widgets.id }).from(widgets).where(eq(widgets.id, 7)).for('update');
  });
  expect(locked).toEqual([{ id: 7 }]);

  await expect(db.update(widgets).set({ name: 'renamed' }).where(eq(widgets.id, 7))).rejects.toBe(failure);
  expect(await db.select().from(gadgets)).toEqual([{ id: 8 }]);

  expect(fake.state.recorded.map(({ op, table }) => [op, getTableName(table as Table)])).toEqual([
    ['select', 'widgets'],
    ['update', 'widgets'],
    ['select', 'gadgets'],
  ]);
  expect(fake.state.calls).toEqual({ select: 2, insert: 0, update: 1, delete: 0, execute: 0, transaction: 1 });
});

test('writes record their table, execute resolves [] without taking a result, and reset clears every record', async () => {
  const fake = createFakeQueryChain();
  const db = asDatabase(fake.chain);
  fake.state.results = [[{ id: 1 }], undefined];

  const inserted = await db
    .insert(widgets)
    .values({ id: 1, name: 'new' })
    .onConflictDoNothing()
    .returning({ id: widgets.id });
  expect(inserted).toEqual([{ id: 1 }]);
  expect(await db.execute(sql`select 1`)).toEqual([]);
  expect(await db.delete(gadgets).where(eq(gadgets.id, 2))).toBeUndefined();
  expect(fake.state.recorded.map(({ op, table }) => [op, getTableName(table as Table)])).toEqual([
    ['insert', 'widgets'],
    ['delete', 'gadgets'],
  ]);
  expect(fake.state.calls).toEqual({ select: 0, insert: 1, update: 0, delete: 1, execute: 1, transaction: 0 });

  fake.state.results = [[{ id: 3 }]];
  fake.reset();
  expect(fake.state).toEqual({
    results: [],
    recorded: [],
    calls: { select: 0, insert: 0, update: 0, delete: 0, execute: 0, transaction: 0 },
  });
  expect(await db.select().from(widgets)).toEqual([]);
});
