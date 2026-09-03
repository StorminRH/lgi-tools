import {
  bigint,
  bigserial,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { ownerSyncStateColumns } from '@/lib/db-columns';
import { esiSnapshots } from '@/data/esi-snapshots/schema';

export const OWNED_ASSET_OWNER_TYPES = ['character', 'corporation'] as const;
export type OwnedAssetOwnerType = (typeof OWNED_ASSET_OWNER_TYPES)[number];
export const ownedAssetOwnerTypeEnum = pgEnum('owned_asset_owner_type', OWNED_ASSET_OWNER_TYPES);

/**
 * The owned-asset rows. Columns are the OwnedAsset projection (esi-projection.ts)
 * verbatim plus the owner key. The projection AGGREGATES the raw ESI asset list
 * by (type_id, location_id, location_flag, location_type), summing quantity — so
 * a row here is "this owner holds N units of this type at this location", not a
 * raw per-item stack. That aggregation IS the natural key: together with the
 * owner pair it is unique by construction on every write path, so
 * `owned_assets_natural_key_unique` enforces it in Postgres. The synthetic `id`
 * stays as the addressable primary key. The unique index leads with
 * (owner_type, owner_id, type_id), so it also serves the per-owner read and the
 * bounded per-type lookup the planner's asset ledger makes — it replaces the
 * former `owned_assets_owner_idx` rather than sitting beside it.
 *
 * The constraint is load-bearing, not decorative: a refresh REPLACES the whole
 * set for an owner (delete-then-insert) on the transaction-free neon-http
 * driver, so two concurrent refreshes for one owner can interleave and double
 * the ledger the planner sums. The unique index turns that silent corruption
 * into a caught unique violation the writer reports as 'superseded'.
 *
 * No foreign key on owner_id: for a corporation owner it is a corp id with no
 * `characters` row, so the column can't FK uniformly — the same FK-less posture
 * as owned_blueprints.
 *
 * quantity is `bigint` because an aggregated stack of a common mineral can blow
 * past int4 (2.1B). `mode: 'number'` keeps the JS-side value a plain number —
 * safe because no EVE asset quantity approaches Number.MAX_SAFE_INTEGER (2^53),
 * even summed. Do NOT switch to `mode: 'bigint'`: every consumer expects a number.
 */
export const ownedAssets = pgTable(
  'owned_assets',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    ownerType: ownedAssetOwnerTypeEnum('owner_type').notNull(),
    ownerId: bigint('owner_id', { mode: 'number' }).notNull(),
    typeId: integer('type_id').notNull(),
    quantity: bigint('quantity', { mode: 'number' }).notNull(),
    locationId: bigint('location_id', { mode: 'number' }).notNull(),
    locationFlag: text('location_flag').notNull(),
    locationType: text('location_type').notNull(),
    snapshotId: bigint('snapshot_id', { mode: 'number' }).references(() => esiSnapshots.id),
  },
  (t) => [
    uniqueIndex('owned_assets_natural_key_unique').on(
      t.ownerType,
      t.ownerId,
      t.typeId,
      t.locationId,
      t.locationFlag,
      t.locationType,
    ),
    index('owned_assets_snapshot_idx').on(t.snapshotId),
  ],
);

export const ownedAssetSyncs = pgTable(
  'owned_asset_syncs',
  ownerSyncStateColumns(ownedAssetOwnerTypeEnum),
  (t) => [primaryKey({ columns: [t.ownerType, t.ownerId] })],
);
