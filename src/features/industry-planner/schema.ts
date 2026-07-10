import { boolean, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from '@/features/auth/schema';
import type { PlanSnapshotV1 } from './template-snapshot';

// Per-user SAVED BUILD TEMPLATES (3.7.23.1) — a named snapshot of the planner's
// complete configuration (inputs only, versioned; see template-snapshot.ts).
// App-authored and non-regenerable (a teardown + resync can't reproduce it), so
// it lives in Neon, never Convex (the placement-by-temperature rule), and its
// purge contributor (./purge.ts) lands with this schema — the ACCOUNT.1 gate
// fails closed otherwise.
//
// blueprint_type_id / product_type_id carry NO FK: eve SDE tables are TRUNCATEd
// + rebuilt on re-ingest, so an FK would block the ingest (the custom_structures
// system_id posture); the create route validates the blueprint at the boundary.
// product_type_id + product_name are denormalized AT SAVE so the template list
// renders (icon + name) without ever opening snapshots.
export const savedPlans = pgTable('saved_plans', {
  // App-generated (crypto.randomUUID) — opaque, never an ESI/SDE id.
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  favorite: boolean('favorite').notNull().default(false),
  blueprintTypeId: integer('blueprint_type_id').notNull(),
  productTypeId: integer('product_type_id').notNull(),
  productName: text('product_name').notNull(),
  snapshot: jsonb('snapshot').$type<PlanSnapshotV1>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});
