import { pgTable, PgDialect, primaryKey, text, type PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';
import {
  MergeIncompleteError,
  assertSourceEmpty,
  executeMergeRules,
  ruleTables,
  userKeyColumn,
} from './merge';
import type { MergeSubject, MergeTx } from './types';

const subject: MergeSubject = { sourceUserId: 'src', survivorUserId: 'surv' };

const prefs = pgTable(
  'user_preferences',
  { userId: text('user_id'), key: text('key') },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);
const plans = pgTable('saved_plans', { id: text('id').primaryKey(), userId: text('user_id') });
const jobs = pgTable('esi_refresh_jobs', { userId: text('user_id') });
const skills = pgTable('character_skills', { characterId: text('character_id') });

function fakeTx(rowsPerStatement: unknown[][] = []) {
  const dialect = new PgDialect();
  const statements: { sql: string; params: unknown[] }[] = [];
  const execute = vi.fn(async (query: Parameters<PgDialect['sqlToQuery']>[0]) => {
    const rendered = dialect.sqlToQuery(query);
    statements.push({ sql: rendered.sql.replace(/\s+/g, ' ').trim(), params: rendered.params });
    return rowsPerStatement[statements.length - 1] ?? [];
  });
  return { tx: { execute } as unknown as MergeTx, statements };
}

describe('executeMergeRules', () => {
  it('rekeys, drops survivor collisions before rekeying, discards, skips follows-character, and calls custom', async () => {
    const { tx, statements } = fakeTx();
    const custom = vi.fn(async () => undefined);
    await executeMergeRules(
      tx,
      [
        { merge: [{ table: plans, rule: 'rekey' }] },
        {
          merge: [
            { table: prefs, rule: 'survivor-wins', key: [prefs.key] },
            { table: jobs, rule: 'discard', reason: 'regenerable' },
            { table: skills, rule: 'follows-character' },
            { tables: [plans], rule: 'custom', reason: 'paired', merge: custom },
          ],
        },
      ],
      subject,
    );
    expect(statements).toEqual([
      {
        sql: 'UPDATE "saved_plans" SET "user_id" = $1 WHERE "user_id" = $2',
        params: ['surv', 'src'],
      },
      {
        sql:
          'DELETE FROM "user_preferences" AS s WHERE s."user_id" = $1 AND EXISTS ( ' +
          'SELECT 1 FROM "user_preferences" AS v WHERE v."user_id" = $2 AND v."key" = s."key" )',
        params: ['src', 'surv'],
      },
      {
        sql: 'UPDATE "user_preferences" SET "user_id" = $1 WHERE "user_id" = $2',
        params: ['surv', 'src'],
      },
      { sql: 'DELETE FROM "esi_refresh_jobs" WHERE "user_id" = $1', params: ['src'] },
    ]);
    expect(custom).toHaveBeenCalledWith(tx, subject);
  });

  it('refuses a rekey on a table without a user_id column', async () => {
    const { tx } = fakeTx();
    await expect(
      executeMergeRules(tx, [{ merge: [{ table: skills, rule: 'rekey' }] }], subject),
    ).rejects.toThrow('character_skills has no user_id column');
  });
});

describe('assertSourceEmpty', () => {
  it('names every user-keyed table that still holds a source row and skips character-keyed ones', async () => {
    const { tx, statements } = fakeTx([[], [{ '?column?': 1 }], [{ '?column?': 1 }]]);
    await expect(assertSourceEmpty(tx, [skills, plans, jobs, prefs], 'src')).rejects.toEqual(
      new MergeIncompleteError(['esi_refresh_jobs', 'user_preferences']),
    );
    expect(statements.map((s) => s.sql)).toEqual([
      'SELECT 1 FROM "saved_plans" WHERE "saved_plans"."user_id" = $1 LIMIT 1',
      'SELECT 1 FROM "esi_refresh_jobs" WHERE "esi_refresh_jobs"."user_id" = $1 LIMIT 1',
      'SELECT 1 FROM "user_preferences" WHERE "user_preferences"."user_id" = $1 LIMIT 1',
    ]);
  });

  it('resolves when no source rows remain, reading neon-http style {rows} results too', async () => {
    const { tx } = fakeTx([{ rows: [] } as unknown as unknown[]]);
    await expect(assertSourceEmpty(tx, [plans], 'src')).resolves.toBeUndefined();
  });
});

describe('rule reflection', () => {
  it('reads the user_id column and lists the tables a rule covers', () => {
    expect(userKeyColumn(plans)?.name).toBe('user_id');
    expect(userKeyColumn(skills)).toBeNull();
    const tables = (rule: Parameters<typeof ruleTables>[0]): PgTable[] => [...ruleTables(rule)];
    expect(tables({ table: plans, rule: 'rekey' })).toEqual([plans]);
    expect(
      tables({ tables: [plans, prefs], rule: 'custom', reason: 'r', merge: async () => undefined }),
    ).toEqual([plans, prefs]);
  });
});
