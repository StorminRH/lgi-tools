import { eq, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import { requireUserKeyColumn } from './merge';
import type { MergeTx, PurgeContributor, TableMergeRule } from './types';

/**
 * A cache-tier contributor for tables whose rows belong to one character.
 * Claims, follows-character rules and deletes all come from `tables`, so a
 * claimed table cannot miss its delete; deletes run in list order (rows before
 * their sync table). A table keys on a character id column, or on a predicate
 * its slice builds, such as lib's ownerKeyWhere, which this zone cannot import.
 */
export function characterCacheContributor(
  database: MergeTx,
  spec: {
    readonly name: string;
    readonly tables: readonly (
      | { readonly table: PgTable; readonly characterId: PgColumn }
      | { readonly table: PgTable; readonly where: (characterId: number) => SQL }
    )[];
  },
): PurgeContributor {
  return {
    name: spec.name,
    tier: 'cache',
    claims: spec.tables.map((rows) => rows.table),
    merge: spec.tables.map(
      (rows): TableMergeRule => ({ table: rows.table, rule: 'follows-character' }),
    ),
    async purgeCharacter({ characterId }) {
      for (const rows of spec.tables) {
        const where =
          'where' in rows ? rows.where(characterId) : eq(rows.characterId, characterId);
        await database.delete(rows.table).where(where);
      }
    },
  };
}

/**
 * A durable-tier contributor for one table of a user's own rows. The user_id
 * column is found once, at load, so the delete and the rekey or survivor-wins
 * merge always key on the same column; a table without one throws.
 */
export function userRowsContributor(
  database: MergeTx,
  spec: {
    readonly name: string;
    readonly table: PgTable;
    readonly merge:
      | { readonly rule: 'rekey' }
      | { readonly rule: 'survivor-wins'; readonly key: readonly PgColumn[] };
  },
): PurgeContributor {
  const userKey = requireUserKeyColumn(spec.table);
  return {
    name: spec.name,
    tier: 'durable',
    claims: [spec.table],
    merge: [{ ...spec.merge, table: spec.table }],
    async purgeUser({ userId }) {
      await database.delete(spec.table).where(eq(userKey, userId));
    },
  };
}
