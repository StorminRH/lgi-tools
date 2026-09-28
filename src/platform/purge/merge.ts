import { sql, type SQLWrapper } from 'drizzle-orm';
import { getTableConfig, type PgColumn, type PgTable } from 'drizzle-orm/pg-core';
import type { MergeSubject, MergeTx, PurgeContributor, TableMergeRule } from './types';

export const USER_KEY_COLUMN = 'user_id';

export function userKeyColumn(table: PgTable): PgColumn | null {
  return getTableConfig(table).columns.find((column) => column.name === USER_KEY_COLUMN) ?? null;
}

export function ruleTables(rule: TableMergeRule): readonly PgTable[] {
  return rule.rule === 'custom' ? rule.tables : [rule.table];
}

export class MergeIncompleteError extends Error {
  constructor(readonly tablesWithSourceRows: readonly string[]) {
    super(`source user still owns rows in: ${tablesWithSourceRows.join(', ')}`);
    this.name = 'MergeIncompleteError';
  }
}

function requireUserKey(table: PgTable): SQLWrapper {
  const column = userKeyColumn(table);
  if (column === null) {
    throw new Error(`${getTableConfig(table).name} has no ${USER_KEY_COLUMN} column`);
  }
  return sql.identifier(column.name);
}

async function rekey(tx: MergeTx, table: PgTable, subject: MergeSubject): Promise<void> {
  const userKey = requireUserKey(table);
  await tx.execute(sql`
    UPDATE ${table} SET ${userKey} = ${subject.survivorUserId}
    WHERE ${userKey} = ${subject.sourceUserId}
  `);
}

async function dropSurvivorCollisions(
  tx: MergeTx,
  table: PgTable,
  key: readonly PgColumn[],
  subject: MergeSubject,
): Promise<void> {
  const userKey = requireUserKey(table);
  const sameKey = sql.join(
    key.map((column) => sql`v.${sql.identifier(column.name)} = s.${sql.identifier(column.name)}`),
    sql` AND `,
  );
  await tx.execute(sql`
    DELETE FROM ${table} AS s
    WHERE s.${userKey} = ${subject.sourceUserId}
      AND EXISTS (
        SELECT 1 FROM ${table} AS v
        WHERE v.${userKey} = ${subject.survivorUserId} AND ${sameKey}
      )
  `);
}

async function discard(tx: MergeTx, table: PgTable, subject: MergeSubject): Promise<void> {
  const userKey = requireUserKey(table);
  await tx.execute(sql`DELETE FROM ${table} WHERE ${userKey} = ${subject.sourceUserId}`);
}

async function applyRule(tx: MergeTx, rule: TableMergeRule, subject: MergeSubject): Promise<void> {
  switch (rule.rule) {
    case 'rekey':
      return rekey(tx, rule.table, subject);
    case 'survivor-wins':
      await dropSurvivorCollisions(tx, rule.table, rule.key, subject);
      return rekey(tx, rule.table, subject);
    case 'discard':
      return discard(tx, rule.table, subject);
    case 'follows-character':
      return;
    case 'custom':
      return rule.merge(tx, subject);
  }
}

export async function executeMergeRules(
  tx: MergeTx,
  contributors: readonly Pick<PurgeContributor, 'merge'>[],
  subject: MergeSubject,
): Promise<void> {
  for (const contributor of contributors) {
    for (const rule of contributor.merge) {
      await applyRule(tx, rule, subject);
    }
  }
}

function resultRows(result: unknown): unknown[] {
  return Array.isArray(result) ? result : (result as { rows: unknown[] }).rows;
}

export async function assertSourceEmpty(
  tx: MergeTx,
  tables: readonly PgTable[],
  sourceUserId: string,
): Promise<void> {
  const occupied: string[] = [];
  for (const table of tables) {
    const column = userKeyColumn(table);
    if (column === null) continue;
    const rows = resultRows(
      await tx.execute(sql`SELECT 1 FROM ${table} WHERE ${column} = ${sourceUserId} LIMIT 1`),
    );
    if (rows.length > 0) occupied.push(getTableConfig(table).name);
  }
  if (occupied.length > 0) throw new MergeIncompleteError(occupied.sort());
}
