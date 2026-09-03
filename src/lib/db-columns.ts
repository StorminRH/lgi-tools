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
 * Fresh identity columns for an app-authored per-user row (id, owner, name,
 * created-at). Callers pass the user-id reference so lib never imports db.
 */
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
