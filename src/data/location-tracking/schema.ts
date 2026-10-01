import { sql } from 'drizzle-orm';
import { bigint, check, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { user } from '@/db/auth-schema';
import { RECEIPT_CLEANUP_TASK } from './constants';

export interface TrackingSelection {
  readonly mapId: string;
  readonly characterId: number;
  readonly lastProcessedTransitionAt?: number;
}

export const pendingTrackingMerges = pgTable('pending_tracking_merges', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  sourceUserId: text('source_user_id').notNull(),
  selections: jsonb('selections').$type<TrackingSelection[]>().notNull(),
  queuedAt: timestamp('queued_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index('pending_tracking_merges_user_idx').on(table.userId)]);

export const trackingReceiptCleanup = pgTable('tracking_receipt_cleanup', {
  task: text('task').primaryKey().default(RECEIPT_CLEANUP_TASK),
  cutoffMs: bigint('cutoff_ms', { mode: 'number' }).notNull(),
  cursor: text('cursor'),
}, (table) => [check('tracking_receipt_cleanup_singleton', sql`${table.task} = 'merge_tracking_receipts'`)]);
