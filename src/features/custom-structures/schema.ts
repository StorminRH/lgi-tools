import { doublePrecision, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from '@/features/auth/schema';

// Per-user, APP-AUTHORED custom structures (3.7.9) — a saved Upwell structure
// definition (its type + fitted rigs + a name) the user assembles by hand in the
// structure builder. This is the platform's 2nd app-authored datum (the corp-
// sharing setting is the 1st, 3.7.9.1.4): a system-of-record, NOT a regenerable
// ESI cache — a full teardown + resync can't reproduce it — so it lives in Neon
// and never in Convex (the placement-by-temperature rule).
//
// NO security column ON PURPOSE: a structure's rig bonus scales against the
// SECURITY of the planner's selected build system at planning time, never a
// property of the structure record. `system_id` (3.7.13.2) is an OPTIONAL pin
// and does not bend that rule — it is a home SYSTEM, not a security band: a
// pinned structure appears only in that system's build list and selecting it
// points the planner at the system, which still supplies the security at
// select-time. Null = portable (shown in every system's list). No FK on
// system_id: eve_solar_systems is TRUNCATEd + rebuilt on every SDE re-ingest,
// so an FK would block the ingest (the corp_structures posture); the pin
// routes validate existence at the boundary instead. `rig_type_ids` is stored
// as JSONB (the corp_structure_syncs.page_etags precedent), not a pg array.
export const customStructures = pgTable('custom_structures', {
  // App-generated (crypto.randomUUID) — opaque, never an ESI/SDE id.
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  structureTypeId: integer('structure_type_id').notNull(),
  rigTypeIds: jsonb('rig_type_ids').$type<number[]>().notNull().default([]),
  systemId: integer('system_id'),
  // Owner-imagined facility tax PERCENT (0–10, decimals; 3.7.13.3). Null = never
  // entered — the fee path then assumes the 0.25% NPC baseline. One field serves
  // portable and pinned alike: the pin fixes WHERE (the cost-index system), the
  // tax stays a property of the imagined structure.
  taxPct: doublePrecision('tax_pct'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
