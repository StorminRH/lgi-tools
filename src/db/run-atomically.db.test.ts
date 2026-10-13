import { sql } from 'drizzle-orm';
import { bigint, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { beforeAll, beforeEach, expect, test } from 'vitest';
import { createDbTestHarness } from '@/db/__tests__/support/db-test-harness';
import { excludedSet, proposedRowsWhere } from '@/lib/db-upsert';
import { db, runAtomically } from './index';

const harness = await createDbTestHarness({ schema: 'test_run_atomically', tables: [], steerDbProxy: true });

/** A scratch table of this suite's own: an answer row and the data it vouches for, in one shape. */
const notes = pgTable('atomic_notes', {
  id: bigint('id', { mode: 'number' }).primaryKey(),
  label: text('label').notNull(),
  tags: text('tags').array().notNull(),
  body: jsonb('body').$type<{ items: number[] }>(),
  checkedAt: timestamp('checked_at', { withTimezone: true }).notNull(),
});

beforeAll(async () => {
  if (!harness.reachable) return;
  await harness.sql`
    CREATE TABLE atomic_notes (
      id bigint PRIMARY KEY,
      label text NOT NULL,
      tags text[] NOT NULL,
      body jsonb,
      checked_at timestamptz NOT NULL
    )
  `;
});

beforeEach(async () => {
  if (harness.reachable) await harness.sql`DELETE FROM atomic_notes`;
});

const CHECKED = new Date('2026-10-12T12:00:00.123Z');

const note = (id: number, label: string) => ({ id, label, tags: ['a', 'b'], body: { items: [id] }, checkedAt: CHECKED });

/** Whether note `id` is stored with `label`: the guard a later statement of the same batch carries. */
const stored = (id: number, label: string) =>
  sql`exists (select 1 from ${notes} where ${notes.id} = ${id} and ${notes.label} = ${label})`;

/** Inserts `row` only where `guard` holds, and replaces its label on a conflict. */
const guardedInsert = (row: ReturnType<typeof note>, guard = sql`true`) =>
  db
    .insert(notes)
    .select(proposedRowsWhere(notes, [row], guard))
    .onConflictDoUpdate({ target: notes.id, set: excludedSet(notes, ['label']) })
    .returning({ id: notes.id });

const allNotes = () => harness.db.select().from(notes).orderBy(notes.id);

test.skipIf(!harness.reachable)(
  'a later statement whose guard reads an earlier statement\'s write applies, every value keeping its column type',
  async () => {
    const results = await runAtomically([guardedInsert(note(1, 'first')), guardedInsert(note(2, 'second'), stored(1, 'first'))]);

    expect(results.map((rows) => rows.length)).toEqual([1, 1]);
    expect(await allNotes()).toEqual([
      { id: 1, label: 'first', tags: ['a', 'b'], body: { items: [1] }, checkedAt: CHECKED },
      { id: 2, label: 'second', tags: ['a', 'b'], body: { items: [2] }, checkedAt: CHECKED },
    ]);
  },
);

test.skipIf(!harness.reachable)(
  'a guard that does not hold writes nothing, on the insert branch and the update branch alike, and returns no rows',
  async () => {
    await runAtomically([guardedInsert(note(1, 'kept'))]);

    const results = await runAtomically([
      guardedInsert(note(1, 'replaced'), stored(9, 'missing')),
      guardedInsert(note(2, 'inserted'), stored(9, 'missing')),
    ]);

    expect(results).toEqual([[], []]);
    expect((await allNotes()).map(({ id, label }) => ({ id, label }))).toEqual([{ id: 1, label: 'kept' }]);
  },
);

test.skipIf(!harness.reachable)('a failing statement rolls back every statement before it', async () => {
  const failing = db.insert(notes).values({ ...note(3, 'third'), label: sql`null` });

  await expect(runAtomically([guardedInsert(note(1, 'first')), guardedInsert(note(2, 'second')), failing])).rejects.toMatchObject({
    code: '23502',
  });

  expect(await allNotes()).toEqual([]);
});
