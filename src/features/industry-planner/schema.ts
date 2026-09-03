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
