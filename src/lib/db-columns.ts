// Shared Drizzle column sets (lib zone — feature schema.ts → lib is boundary-legal;
// drizzle-orm/pg-core is a package import, unconstrained by zones). The paged owned-*
// twins (owned_asset_syncs, owned_blueprint_syncs) share the identical per-owner
// sync-state column set — the staleness stamp + the replayed per-page etags. Each
// slice keeps its OWN Postgres enum (the one-source-of-truth rule forbids sharing a pg
// enum across features), so the enum is a parameter; the returned column object is
// spread into each pgTable, per Drizzle's documented reusable-columns pattern. The
// evaluated schema is byte-identical to the inline columns it replaces — no migration.
import { bigint, jsonb, type PgEnum, timestamp } from 'drizzle-orm/pg-core';

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
