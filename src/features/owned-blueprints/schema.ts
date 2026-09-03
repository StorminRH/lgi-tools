import { bigint, bigserial, index, integer, pgEnum, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';
import { ownerSyncStateColumns } from '@/lib/db-columns';

export const OWNED_BLUEPRINT_OWNER_TYPES = ['character', 'corporation'] as const;

export type OwnedBlueprintOwnerType = (typeof OWNED_BLUEPRINT_OWNER_TYPES)[number];

export const ownedBlueprintOwnerTypeEnum = pgEnum(
  'owned_blueprint_owner_type',
  OWNED_BLUEPRINT_OWNER_TYPES,
);

/**
 * The owned-blueprint rows. Columns are the OwnedBlueprint projection
 * (esi-projection.ts) verbatim plus the owner key. A refresh REPLACES the whole
 * set for an owner (delete-then-insert), so there is no natural unique key to
 * reconcile against — ESI's `item_id` is intentionally dropped by the projection,
 * and two BPCs of the same type/location/ME/TE/runs are legitimately
 * indistinguishable rows. A synthetic `id` keeps each row addressable; the owner
 * index serves the per-owner read.
 *
 * No foreign key on owner_id: for a corporation owner it is a corp id with no
 * `characters` row, so the column can't FK uniformly — the same FK-less posture
 * as corp_access_audit, where the id is recorded provenance.
 */
export const ownedBlueprints = pgTable(
  'owned_blueprints',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    ownerType: ownedBlueprintOwnerTypeEnum('owner_type').notNull(),
    ownerId: bigint('owner_id', { mode: 'number' }).notNull(),
    typeId: integer('type_id').notNull(),
    materialEfficiency: integer('material_efficiency').notNull(),
    timeEfficiency: integer('time_efficiency').notNull(),

    runs: integer('runs').notNull(),
    quantity: integer('quantity').notNull(),
    locationId: bigint('location_id', { mode: 'number' }).notNull(),
    locationFlag: text('location_flag').notNull(),
  },
  (t) => [index('owned_blueprints_owner_idx').on(t.ownerType, t.ownerId)],
);

export const ownedBlueprintSyncs = pgTable(
  'owned_blueprint_syncs',
  ownerSyncStateColumns(ownedBlueprintOwnerTypeEnum),
  (t) => [primaryKey({ columns: [t.ownerType, t.ownerId] })],
);
