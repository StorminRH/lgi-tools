import {
  bigint,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from '@/db/auth-schema';

/** Persisted map roles; this tuple is the single TypeScript and Postgres vocabulary. */
export const MAP_ROLES = ['viewer', 'editor', 'owner'] as const;
/** One persisted map role. */
export type MapRole = (typeof MAP_ROLES)[number];
/** Drizzle owner of the persisted map-role enum. */
export const mapRoleEnum = pgEnum('map_role', MAP_ROLES);

/** Principal kinds that may receive a delegated map grant. */
export const MAP_ACCESS_OWNER_TYPES = ['character', 'corporation'] as const;
/** One persisted map-grant principal kind. */
export type MapAccessOwnerType = (typeof MAP_ACCESS_OWNER_TYPES)[number];
/** Drizzle owner of the persisted map-grant principal enum. */
export const mapAccessOwnerTypeEnum = pgEnum(
  'map_access_owner_type',
  MAP_ACCESS_OWNER_TYPES,
);

/** Durable Neon identity and ownership for one collaborative map. */
export const maps = pgTable(
  'maps',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (table) => [index('maps_user_id_idx').on(table.userId)],
);

/**
 * One delegated role per map and character or corporation principal.
 * `maps.user_id`, not an owner grant, remains authoritative for map creation ownership.
 */
export const mapAccess = pgTable(
  'map_access',
  {
    mapId: uuid('map_id')
      .notNull()
      .references(() => maps.id, { onDelete: 'cascade' }),
    ownerType: mapAccessOwnerTypeEnum('owner_type').notNull(),
    ownerId: bigint('owner_id', { mode: 'number' }).notNull(),
    role: mapRoleEnum('role').notNull(),
    grantedAt: timestamp('granted_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('map_access_map_grantee_unique').on(
      table.mapId,
      table.ownerType,
      table.ownerId,
    ),
  ],
);
