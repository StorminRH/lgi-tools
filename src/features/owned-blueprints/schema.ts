// Neon storage for owned blueprints (MIGRATE.0) — the Neon-native home for the
// character AND corporation owned-blueprint reads, replacing the dormant 3.7.5.1
// Convex datasets. Blueprints cache 3600s at ESI with no time-flip, so by the
// placement-by-temperature rule (docs/CONVEX.md) they are slow, per-owner data:
// Neon + a stale-gated on-view refresh, not the live engine. This is the first
// Neon slow-data slice and the template the live-tracker migrations (A–D) follow.
//
// Two tables, mirroring the Convex `*Sync` metadata + `*SyncData` payload split:
//   - owned_blueprints      — one row per owned blueprint (replace-all per owner)
//   - owned_blueprint_syncs — one row per owner: the staleness stamp + held etags
//
// The owner axis collapses the four Convex tables (char sync/data + corp sync/data)
// into a single discriminated pair: owner_type ∈ {character, corporation}, owner_id
// the character or corporation id.
import { bigint, bigserial, index, integer, pgEnum, pgTable, primaryKey, text } from 'drizzle-orm/pg-core';
import { ownerSyncStateColumns } from '@/lib/db-columns';

// Postgres enum driven from a TS `as const` (the one-source-of-truth invariant).
export const OWNED_BLUEPRINT_OWNER_TYPES = ['character', 'corporation'] as const;
export type OwnedBlueprintOwnerType = (typeof OWNED_BLUEPRINT_OWNER_TYPES)[number];
export const ownedBlueprintOwnerTypeEnum = pgEnum(
  'owned_blueprint_owner_type',
  OWNED_BLUEPRINT_OWNER_TYPES,
);

// The owned-blueprint rows. Columns are the OwnedBlueprint projection
// (esi-projection.ts) verbatim plus the owner key. A refresh REPLACES the whole
// set for an owner (delete-then-insert), so there is no natural unique key to
// reconcile against — ESI's `item_id` is intentionally dropped by the projection,
// and two BPCs of the same type/location/ME/TE/runs are legitimately
// indistinguishable rows. A synthetic `id` keeps each row addressable; the owner
// index serves the per-owner read.
//
// No foreign key on owner_id: for a corporation owner it is a corp id with no
// `characters` row, so the column can't FK uniformly — the same FK-less posture
// as corp_access_audit, where the id is recorded provenance.
export const ownedBlueprints = pgTable(
  'owned_blueprints',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    ownerType: ownedBlueprintOwnerTypeEnum('owner_type').notNull(),
    ownerId: bigint('owner_id', { mode: 'number' }).notNull(),
    typeId: integer('type_id').notNull(),
    materialEfficiency: integer('material_efficiency').notNull(),
    timeEfficiency: integer('time_efficiency').notNull(),
    // runs: -1 on a BPO (infinite); a BPC's remaining count. quantity: -1 = BPO,
    // -2 = BPC, a positive value = a market stack. Signed ints, stored verbatim.
    runs: integer('runs').notNull(),
    quantity: integer('quantity').notNull(),
    locationId: bigint('location_id', { mode: 'number' }).notNull(),
    locationFlag: text('location_flag').notNull(),
  },
  (t) => [index('owned_blueprints_owner_idx').on(t.ownerType, t.ownerId)],
);

// Per-owner sync state — separate from the data rows so an owner with ZERO
// blueprints still records "checked at T" (otherwise an empty result would look
// un-synced and refetch on every view). `last_refreshed_at` is the staleness gate
// the on-view refresh reads; `page_etags` are the per-page ETags replayed on the
// next refresh so an unchanged owner returns a 304 and skips the row rewrite (the
// gate's own ETag cache is unauthenticated-only, so an authed reader holds them).
export const ownedBlueprintSyncs = pgTable(
  'owned_blueprint_syncs',
  ownerSyncStateColumns(ownedBlueprintOwnerTypeEnum),
  (t) => [primaryKey({ columns: [t.ownerType, t.ownerId] })],
);
