import { bigint, boolean, doublePrecision, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { SECURITY_CLASSES } from '@/data/eve-data/security';

export const securityClassEnum = pgEnum('security_class', SECURITY_CLASSES);

/**
 * One row per owned structure. The columns are the projection (esi-projection.ts)
 * plus the system's derived security band: `structure_id`/`type_id`/`system_id`/
 * `name` come straight from the corp-structures endpoint (the corp owns them, so
 * the name is authoritative, not best-effort resolved); `security_class` is derived
 * at write from the system's SDE security status. A refresh REPLACES the corp's
 * whole set (delete-then-insert), so (corporation_id, structure_id) is the natural
 * composite key — the leading corporation_id also serves the per-corp read + delete.
 *
 * No foreign key on system_id: eve_solar_systems is TRUNCATEd + rebuilt on every SDE
 * re-ingest, so an FK with onDelete:restrict would block the ingest — the same
 * FK-less provenance posture the owned-assets / owned-blueprints tables take. The
 * security band is read off the SDE at write instead.
 */
export const corpStructures = pgTable(
  'corp_structures',
  {
    corporationId: bigint('corporation_id', { mode: 'number' }).notNull(),
    structureId: bigint('structure_id', { mode: 'number' }).notNull(),
    typeId: integer('type_id').notNull(),
    systemId: integer('system_id').notNull(),
    securityClass: securityClassEnum('security_class').notNull(),

    name: text('name'),
  },

  (t) => [primaryKey({ columns: [t.corporationId, t.structureId] })],
);

export const corpStructureSyncs = pgTable('corp_structure_syncs', {
  corporationId: bigint('corporation_id', { mode: 'number' }).primaryKey(),
  lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }).notNull(),
  pageEtags: jsonb('page_etags').$type<string[]>().default([]).notNull(),
});

/**
 * Per-corp sharing consent — APP-AUTHORED system-of-record (NOT regenerable cache
 * like the two tables above). A corp's structures are private until a Station_Manager
 * opts the corp in here. Default OFF: a corp with no row, or `enabled: false`, gates
 * the pull (the sync engine's precondition reads this before any staleness check or
 * token vend) AND fails the read closed — so a non-opted-in corp dispatches zero ESI,
 * stores zero rows, and shows nothing. Disabling wipes the corp's regenerable rows +
 * sync state + authored rigs (below); re-enabling re-pulls from scratch on next view.
 * Keyed by corporation_id alone (one shared setting per corp); `set_by` is the
 * character id that last flipped it (audit only, nullable).
 */
export const corpStructureSharing = pgTable('corp_structure_sharing', {
  corporationId: bigint('corporation_id', { mode: 'number' }).primaryKey(),
  enabled: boolean('enabled').default(false).notNull(),
  setBy: bigint('set_by', { mode: 'number' }),
  setAt: timestamp('set_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Authored COMPLETION of a corp's structures — APP-AUTHORED system-of-record for
 * what ESI does not expose about a structure: its fitted rigs AND its owner-set
 * facility tax (neither appears on any ESI route; the tax is a structure-profile
 * setting the API never surfaces). A Station_Manager records them here to make the
 * bonus and the job fee exact; without a row a structure contributes its type bonus
 * only (empty rig set) and the fee path assumes the 0.25% NPC-baseline tax. MUST
 * survive the hourly full-replace pull: `saveCorpStructures` rewrites only
 * corp_structures + corp_structure_syncs and never touches this table, so a re-pull
 * cannot clobber the authored values. Wiped only when sharing is disabled. Keyed by
 * (corporation_id, structure_id); no FK to corp_structures (regenerable,
 * replace-all) — same FK-less posture as the rows above.
 */
export const corpStructureRigs = pgTable(
  'corp_structure_rigs',
  {
    corporationId: bigint('corporation_id', { mode: 'number' }).notNull(),
    structureId: bigint('structure_id', { mode: 'number' }).notNull(),
    rigTypeIds: jsonb('rig_type_ids').$type<number[]>().default([]).notNull(),

    taxPct: doublePrecision('tax_pct'),
    setAt: timestamp('set_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.corporationId, t.structureId] })],
);
