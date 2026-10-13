import { eq, sql, type SQL } from 'drizzle-orm';
import {
  bigint,
  jsonb,
  text,
  timestamp,
  type AnyPgColumn,
  type PgEnum,
} from 'drizzle-orm/pg-core';

/**
 * Fresh column builders per call (Drizzle column builders are single-use — a table
 * owns its columns), so the two owned-* sync tables can't share one frozen object.
 */
export function ownerSyncStateColumns<T extends [string, ...string[]]>(ownerTypeEnum: PgEnum<T>) {
  return {
    ownerType: ownerTypeEnum('owner_type').notNull(),
    ownerId: bigint('owner_id', { mode: 'number' }).notNull(),
    lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }).notNull(),
    pageEtags: jsonb('page_etags').$type<string[]>().default([]).notNull(),
  };
}

/**
 * The query-side twin of ownerSyncStateColumns: `(owner_type = $1 and owner_id = $2)`.
 * The owner type is checked against the table's own enum, and the result is always
 * SQL (and() may return undefined), so it stands alone in a where or nests in and().
 */
export function ownerKeyWhere<TOwnerType extends AnyPgColumn>(
  table: { ownerType: TOwnerType; ownerId: AnyPgColumn },
  owner: { ownerType: TOwnerType['_']['data']; ownerId: number },
): SQL {
  return sql`(${eq(table.ownerType, owner.ownerType)} and ${eq(table.ownerId, owner.ownerId)})`;
}

export function ownedRowIdentityColumns(userIdReferences: () => AnyPgColumn) {
  return {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(userIdReferences, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  };
}
