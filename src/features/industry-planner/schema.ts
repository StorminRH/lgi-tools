import { boolean, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from '@/db/auth-schema';
import { ownedRowIdentityColumns } from '@/lib/db-columns';
import type { PlanSnapshotWire } from './template-snapshot';

export const savedPlans = pgTable('saved_plans', {
  ...ownedRowIdentityColumns(() => user.id),
  favorite: boolean('favorite').notNull().default(false),
  blueprintTypeId: integer('blueprint_type_id').notNull(),
  productTypeId: integer('product_type_id').notNull(),
  productName: text('product_name').notNull(),
  snapshot: jsonb('snapshot').$type<PlanSnapshotWire>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Production profiles. `revision` bumps on every edit so a template can tell
 * its profile changed and a tracked build can keep the revision it started
 * from. Deleting a profile stamps `deleted_at` and keeps the row, so a later
 * reference still resolves to a named, deleted profile instead of nothing.
 */
export const industryProfiles = pgTable('industry_profiles', {
  ...ownedRowIdentityColumns(() => user.id),
  revision: integer('revision').notNull().default(1),
  // Any document shape this app has written; read through readStoredDocument.
  document: jsonb('document').$type<unknown>().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});
