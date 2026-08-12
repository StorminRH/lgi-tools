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
import {
  MAP_ACCESS_OWNER_TYPES,
  MAP_ROLES,
  type MapAccessOwnerType,
  type MapRole,
} from './access-contract';

// The role vocabulary itself lives in the pure ./access-contract owner so the Convex gate can share
// it without importing Drizzle. This module remains its Postgres home and public re-export.
export {
  MAP_ACCESS_OWNER_TYPES,
  MAP_ROLES,
  type MapAccessOwnerType,
  type MapRole,
};

/** Drizzle owner of the persisted map-role enum. */
export const mapRoleEnum = pgEnum('map_role', MAP_ROLES);

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
    tombstonedAt: timestamp('tombstoned_at', { withTimezone: true }),
    purgeRequestedAt: timestamp('purge_requested_at', { withTimezone: true }),
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
