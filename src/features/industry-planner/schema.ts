import { boolean, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from '@/db/auth-schema';
import { ownedRowIdentityColumns } from '@/lib/db-columns';
import type { PlanSnapshotWire } from './template-snapshot';

/**
 * Per-user SAVED BUILD TEMPLATES (3.7.23.1) — a named snapshot of the planner's
 * complete configuration (inputs only, versioned; see template-snapshot.ts).
 * App-authored and non-regenerable (a teardown + resync can't reproduce it), so
 * it lives in Neon, never Convex (the placement-by-temperature rule), and its
 * purge contributor (./purge.ts) lands with this schema — the ACCOUNT.1 gate
 * fails closed otherwise.
 *
 * blueprint_type_id / product_type_id carry NO FK: eve SDE tables are TRUNCATEd
 * + rebuilt on re-ingest, so an FK would block the ingest (the custom_structures
 * system_id posture); the create route validates the blueprint at the boundary.
 * product_type_id + product_name are denormalized AT SAVE so the template list
 * renders (icon + name) without ever opening snapshots.
 */
export const savedPlans = pgTable('saved_plans', {
  ...ownedRowIdentityColumns(() => user.id),
  favorite: boolean('favorite').notNull().default(false),
  blueprintTypeId: integer('blueprint_type_id').notNull(),
  productTypeId: integer('product_type_id').notNull(),
  productName: text('product_name').notNull(),
  snapshot: jsonb('snapshot').$type<PlanSnapshotWire>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
