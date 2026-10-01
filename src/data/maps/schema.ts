import {
  bigint,
  index,
  pgEnum,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { user } from '@/db/auth-schema';
import {
  MAP_ACCESS_OWNER_TYPES,
  MAP_ROLES,
} from './access-contract';
import { MAP_LIFECYCLE_STATUSES } from './lifecycle-contract';

export const mapRoleEnum = pgEnum('map_role', MAP_ROLES);

export const mapAccessOwnerTypeEnum = pgEnum(
  'map_access_owner_type',
  MAP_ACCESS_OWNER_TYPES,
);

export const mapLifecycleStatusEnum = pgEnum(
  'map_lifecycle_status',
  MAP_LIFECYCLE_STATUSES,
);

export const MAP_ACCESS_PROJECTION_REVISION_SEQUENCE =
  'map_access_projection_revision';

export const mapAccessProjectionRevisionSequence = pgSequence(
  MAP_ACCESS_PROJECTION_REVISION_SEQUENCE,
);

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
    purgeClaimedAt: timestamp('purge_claimed_at', { withTimezone: true }),
    lifecycleStatus: mapLifecycleStatusEnum('lifecycle_status')
      .notNull()
      .default('active'),
    lifecycleEnteredAt: timestamp('lifecycle_entered_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    // Null while the map still grants tracking per account; see map-character-scoping.
    characterScopedAt: timestamp('character_scoped_at', { withTimezone: true }),
  },
  (table) => [index('maps_user_id_idx').on(table.userId)],
);

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
    index('map_access_grantee_idx').on(table.ownerType, table.ownerId),
    uniqueIndex('map_access_map_grantee_unique').on(
      table.mapId,
      table.ownerType,
      table.ownerId,
    ),
  ],
);

/** Characters barred from a map; see mapBlockAccounts for the accounts they keep off it. */
export const mapBlocks = pgTable(
  'map_blocks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    mapId: uuid('map_id')
      .notNull()
      .references(() => maps.id, { onDelete: 'cascade' }),
    characterId: bigint('character_id', { mode: 'number' }).notNull(),
    blockedByUserId: text('blocked_by_user_id'),
    blockedAt: timestamp('blocked_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('map_blocks_map_character_unique').on(table.mapId, table.characterId),
    index('map_blocks_character_idx').on(table.characterId),
    index('map_blocks_blocked_by_idx').on(table.blockedByUserId),
  ],
);

/**
 * Every account that has held a blocked character while the block stood,
 * except the map creator. Each stays off the map alongside the current holder.
 */
export const mapBlockAccounts = pgTable(
  'map_block_accounts',
  {
    blockId: uuid('block_id')
      .notNull()
      .references(() => mapBlocks.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [
    primaryKey({ columns: [table.blockId, table.userId] }),
    index('map_block_accounts_user_idx').on(table.userId),
  ],
);

export const pendingMapAccessChanges = pgTable('map_access_changes', {
  mapId: uuid('map_id').primaryKey().references(() => maps.id, { onDelete: 'cascade' }),
  version: uuid('version').defaultRandom().notNull(),
  queuedAt: timestamp('queued_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index('map_access_changes_queued_idx').on(table.queuedAt, table.mapId),
]);
