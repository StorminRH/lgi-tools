// Neon storage for owned assets (3.7.7.1) — the Neon-native home for the
// character AND corporation owned-asset reads. The assets endpoints cache 3600s
// at ESI with no time-flip, so by the placement-by-temperature rule
// (docs/CONVEX.md) they are slow, per-owner data: Neon + a stale-gated on-view
// refresh, not the live engine. This is the second Neon slow-data slice and a
// direct mirror of the owned-blueprints template (MIGRATE.0).
//
// Two tables, the same metadata + payload split as owned blueprints:
//   - owned_assets      — the per-type/per-location owned quantity (replace-all per owner)
//   - owned_asset_syncs — one row per owner: the staleness stamp + held etags
//
// The owner axis collapses character + corporation into a single discriminated
// pair: owner_type ∈ {character, corporation}, owner_id the character or
// corporation id.
import { bigint, bigserial, index, integer, pgEnum, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';
import { ownerSyncStateColumns } from '@/lib/db-columns';
import { esiSnapshots } from '@/data/esi-snapshots/schema';

/**
 * Postgres enum driven from a TS `as const` (the one-source-of-truth invariant).
 * Its own enum, not the owned-blueprints one — features don't share, and a
 * feature → feature import would be a boundary violation.
 */
export const OWNED_ASSET_OWNER_TYPES = ['character', 'corporation'] as const;
/** Closed personal or corporation owner kinds for persisted assets. */
export type OwnedAssetOwnerType = (typeof OWNED_ASSET_OWNER_TYPES)[number];
/**
 * Drizzle schema owner for owned asset owner type enum; migrations, queries, retention, and purge
 * claims derive from this single declaration.
 */
export const ownedAssetOwnerTypeEnum = pgEnum('owned_asset_owner_type', OWNED_ASSET_OWNER_TYPES);

/**
 * The owned-asset rows. Columns are the OwnedAsset projection (esi-projection.ts)
 * verbatim plus the owner key. The projection AGGREGATES the raw ESI asset list
 * by (type_id, location_id, location_flag, location_type), summing quantity — so
 * a row here is "this owner holds N units of this type at this location", not a
 * raw per-item stack. A refresh REPLACES the whole set for an owner
 * (delete-then-insert), so there is no natural unique key to reconcile against;
 * a synthetic `id` keeps each row addressable. The (owner_type, owner_id,
 * type_id) index serves the per-owner read AND the bounded per-type lookup the
 * planner's asset ledger makes.
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
    // ESI types both of these as large, CCP-extended enums (Hangar/CorpSAG1…,
    // station/solar_system/item/other). Stored verbatim as strings so a new flag
    // or location type never fails the boundary parse. location_type is stored
    // (though the held-by readout that needs it lands in 3.7.7.2) because it is
    // what disambiguates location_id — the same numeric id is a station, a
    // structure, or a container item depending on it; deferring it would force a
    // second migration + a full re-sync next session.
    locationFlag: text('location_flag').notNull(),
    locationType: text('location_type').notNull(),
    snapshotId: bigint('snapshot_id', { mode: 'number' }).references(() => esiSnapshots.id),
  },
  (t) => [
    index('owned_assets_owner_idx').on(t.ownerType, t.ownerId, t.typeId),
    index('owned_assets_snapshot_idx').on(t.snapshotId),
  ],
);

/**
 * Per-owner sync state — separate from the data rows so an owner with ZERO
 * assets still records "checked at T" (otherwise an empty result would look
 * un-synced and refetch on every view). `last_refreshed_at` is the staleness gate
 * the on-view refresh reads; `page_etags` are the per-page ETags replayed on the
 * next refresh so an unchanged owner returns a 304 and skips the row rewrite (the
 * gate's own ETag cache is unauthenticated-only, so an authed reader holds them).
 */
export const ownedAssetSyncs = pgTable(
  'owned_asset_syncs',
  ownerSyncStateColumns(ownedAssetOwnerTypeEnum),
  (t) => [primaryKey({ columns: [t.ownerType, t.ownerId] })],
);
