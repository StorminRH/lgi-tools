// Neon storage for corp owned structures (3.7.9) — the Neon-native home for a
// corporation's owned Upwell structures, the catalogue the Industry Planner offers
// as build locations. The corp-structures endpoint caches 3600s at ESI with no
// time-flip, so by the placement-by-temperature rule (docs/CONVEX.md) it is slow,
// shared data: Neon + a stale-gated on-view refresh, not the live engine. Mirrors
// the owned-assets template (paged read, replace-all per owner).
//
// The KEY DIVERGENCE from the corp-jobs / owned-assets tables: this is keyed by
// `corporation_id` ALONE, not (user, corp). A corp's owned structures are the SAME
// for every member, so one shared row set is read by all members of the corp
// (scoped at the read seam by the 3.7.3 corp-access gate) and one member's on-view
// refresh keeps it fresh for everyone — the shared staleness stamp is the dedup.
//
// Two tables, the same metadata + payload split as owned assets:
//   - corp_structures       — one row per owned structure (replace-all per corp)
//   - corp_structure_syncs  — one row per corp: the staleness stamp + held etags
import { bigint, boolean, doublePrecision, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { SECURITY_CLASSES } from '@/data/eve-data/security';

// Postgres enum driven from the shared TS `as const` (the one-source-of-truth
// invariant). The const lives in src/data/eve-data so the structure-bonus math and
// this store share it without a feature→feature import; the enum is defined here,
// with its only column.
export const securityClassEnum = pgEnum('security_class', SECURITY_CLASSES);

// One row per owned structure. The columns are the projection (esi-projection.ts)
// plus the system's derived security band: `structure_id`/`type_id`/`system_id`/
// `name` come straight from the corp-structures endpoint (the corp owns them, so
// the name is authoritative, not best-effort resolved); `security_class` is derived
// at write from the system's SDE security status. A refresh REPLACES the corp's
// whole set (delete-then-insert), so (corporation_id, structure_id) is the natural
// composite key — the leading corporation_id also serves the per-corp read + delete.
//
// No foreign key on system_id: eve_solar_systems is TRUNCATEd + rebuilt on every SDE
// re-ingest, so an FK with onDelete:restrict would block the ingest — the same
// FK-less provenance posture the owned-assets / owned-blueprints tables take. The
// security band is read off the SDE at write instead.
export const corpStructures = pgTable(
  'corp_structures',
  {
    corporationId: bigint('corporation_id', { mode: 'number' }).notNull(),
    structureId: bigint('structure_id', { mode: 'number' }).notNull(),
    typeId: integer('type_id').notNull(),
    systemId: integer('system_id').notNull(),
    securityClass: securityClassEnum('security_class').notNull(),
    // Authoritative name from the corp endpoint. Nullable only so a single weird
    // structure that ever lacks a name never drops the whole corp's catalogue (the
    // selector falls back to the type name for a null).
    name: text('name'),
  },
  // The composite PK's leading column (corporation_id) already indexes the per-corp
  // read + delete, so no separate index is needed.
  (t) => [primaryKey({ columns: [t.corporationId, t.structureId] })],
);

// Per-corp sync state — separate from the rows so a corp with ZERO structures still
// records "checked at T" (otherwise an empty result would look un-synced and refetch
// on every view). `last_refreshed_at` is the shared staleness gate every member's
// on-view refresh reads; `page_etags` are the per-page ETags replayed on the next
// refresh so an unchanged corp returns a 304 and skips the row rewrite. Keyed by
// `corporation_id` alone (shared) — there is no per-user state, and no `sync_error`:
// a corp with no Station_Manager member simply never populates (no rows), it has no
// graceful per-user gate state to surface.
export const corpStructureSyncs = pgTable('corp_structure_syncs', {
  corporationId: bigint('corporation_id', { mode: 'number' }).primaryKey(),
  lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }).notNull(),
  pageEtags: jsonb('page_etags').$type<string[]>().default([]).notNull(),
});

// Per-corp sharing consent — APP-AUTHORED system-of-record (NOT regenerable cache
// like the two tables above). A corp's structures are private until a Station_Manager
// opts the corp in here. Default OFF: a corp with no row, or `enabled: false`, gates
// the pull (the sync engine's precondition reads this before any staleness check or
// token vend) AND fails the read closed — so a non-opted-in corp dispatches zero ESI,
// stores zero rows, and shows nothing. Disabling wipes the corp's regenerable rows +
// sync state + authored rigs (below); re-enabling re-pulls from scratch on next view.
// Keyed by corporation_id alone (one shared setting per corp); `set_by` is the
// character id that last flipped it (audit only, nullable).
export const corpStructureSharing = pgTable('corp_structure_sharing', {
  corporationId: bigint('corporation_id', { mode: 'number' }).primaryKey(),
  enabled: boolean('enabled').default(false).notNull(),
  setBy: bigint('set_by', { mode: 'number' }),
  setAt: timestamp('set_at', { withTimezone: true }).defaultNow().notNull(),
});

// Authored COMPLETION of a corp's structures — APP-AUTHORED system-of-record for
// what ESI does not expose about a structure: its fitted rigs AND its owner-set
// facility tax (neither appears on any ESI route; the tax is a structure-profile
// setting the API never surfaces). A Station_Manager records them here to make the
// bonus and the job fee exact; without a row a structure contributes its type bonus
// only (empty rig set) and the fee path assumes the 0.25% NPC-baseline tax. MUST
// survive the hourly full-replace pull: `saveCorpStructures` rewrites only
// corp_structures + corp_structure_syncs and never touches this table, so a re-pull
// cannot clobber the authored values. Wiped only when sharing is disabled. Keyed by
// (corporation_id, structure_id); no FK to corp_structures (regenerable,
// replace-all) — same FK-less posture as the rows above.
export const corpStructureRigs = pgTable(
  'corp_structure_rigs',
  {
    corporationId: bigint('corporation_id', { mode: 'number' }).notNull(),
    structureId: bigint('structure_id', { mode: 'number' }).notNull(),
    rigTypeIds: jsonb('rig_type_ids').$type<number[]>().default([]).notNull(),
    // Facility tax PERCENT (0–10, decimals; 3.7.13.3). Null = never entered →
    // the fee path assumes the 0.25% NPC baseline. `rig_type_ids` defaults [] so
    // a tax-only structure upserts a legal row with no rigs.
    taxPct: doublePrecision('tax_pct'),
    setAt: timestamp('set_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.corporationId, t.structureId] })],
);
