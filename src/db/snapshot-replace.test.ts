import { integer, pgTable } from 'drizzle-orm/pg-core';
import { expect, test, vi } from 'vitest';
import type { AnyPgDb, PostgresJsDb } from '@/lib/db-types';
import { insertInBatches, replaceOwnerSnapshot } from './snapshot-replace';

const { directDatabaseMock } = vi.hoisted(() => ({ directDatabaseMock: vi.fn() }));
vi.mock('./direct-database', () => ({ directDatabase: directDatabaseMock }));

const items = pgTable('items', { id: integer('id').notNull() });

/** A transaction double that records begin, commit and rollback around the caller's work. */
function fakeDatabase() {
  const events: string[] = [];
  const tx = { name: 'tx' } as unknown as AnyPgDb;
  const database = {
    transaction: async (work: (tx: AnyPgDb) => Promise<unknown>) => {
      events.push('begin');
      try {
        const result = await work(tx);
        events.push('commit');
        return result;
      } catch (error) {
        events.push('rollback');
        throw error;
      }
    },
  } as unknown as PostgresJsDb;
  return { database, events, tx };
}

/** A transaction double whose inserts record each statement's table and row ids. */
function recordingTransaction() {
  const statements: { table: unknown; ids: number[] }[] = [];
  const tx = {
    insert: (table: unknown) => ({
      values: async (batch: { id: number }[]) => {
        statements.push({ table, ids: batch.map((row) => row.id) });
      },
    }),
  } as unknown as AnyPgDb;
  return { statements, tx };
}

/** A unique violation as Drizzle surfaces it: the driver error, code 23505, on the query error's cause. */
function uniqueViolation(): Error {
  return new Error('Failed query: insert', { cause: Object.assign(new Error('duplicate key'), { code: '23505' }) });
}

test('replaceOwnerSnapshot takes the lock before replacing, on one transaction, and reports saved after the commit', async () => {
  directDatabaseMock.mockReset();
  const { database, events, tx } = fakeDatabase();
  const lock = vi.fn(async (_tx: AnyPgDb) => { events.push('lock'); });
  const replace = vi.fn(async (_tx: AnyPgDb) => { events.push('replace'); });

  expect(await replaceOwnerSnapshot({ lock, replace }, database)).toBe('saved');

  expect(events).toEqual(['begin', 'lock', 'replace', 'commit']);
  expect(lock).toHaveBeenCalledExactlyOnceWith(tx);
  expect(replace).toHaveBeenCalledExactlyOnceWith(tx);
  expect(directDatabaseMock).not.toHaveBeenCalled();
});

test('replaceOwnerSnapshot reports a wrapped unique violation as superseded once the transaction rolled back', async () => {
  const { database, events } = fakeDatabase();

  const outcome = await replaceOwnerSnapshot({
    lock: async () => {},
    replace: async () => { throw uniqueViolation(); },
  }, database);

  expect(outcome).toBe('superseded');
  expect(events).toEqual(['begin', 'rollback']);
});

test('replaceOwnerSnapshot rethrows any other failure and replaces nothing when the lock fails', async () => {
  const { database, events } = fakeDatabase();
  const failure = new Error('connection lost');
  const replace = vi.fn(async () => {});

  await expect(replaceOwnerSnapshot({ lock: async () => { throw failure; }, replace }, database)).rejects.toBe(failure);

  expect(replace).not.toHaveBeenCalled();
  expect(events).toEqual(['begin', 'rollback']);
});

test('replaceOwnerSnapshot runs on the direct database when the caller passes none', async () => {
  directDatabaseMock.mockReset();
  const { database, events } = fakeDatabase();
  directDatabaseMock.mockReturnValue(database);

  expect(await replaceOwnerSnapshot({ lock: async () => {}, replace: async () => {} })).toBe('saved');

  expect(directDatabaseMock).toHaveBeenCalledOnce();
  expect(events).toEqual(['begin', 'commit']);
});

test('insertInBatches issues nothing for an empty set and splits a large one, in order, into 1000-row statements', async () => {
  const empty = recordingTransaction();
  await insertInBatches(empty.tx, items, []);
  expect(empty.statements).toEqual([]);

  const { statements, tx } = recordingTransaction();
  const rows = Array.from({ length: 2001 }, (_, id) => ({ id }));
  await insertInBatches(tx, items, rows);

  expect(statements.map((statement) => statement.ids.length)).toEqual([1000, 1000, 1]);
  expect(statements.every((statement) => statement.table === items)).toBe(true);
  expect(statements.flatMap((statement) => statement.ids)).toEqual(rows.map((row) => row.id));
});
