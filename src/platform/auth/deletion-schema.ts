import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const pendingDeletions = pgTable('pending_deletions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull().unique(),
  scope: text('scope', { enum: ['character', 'user', 'transfer'] }).notNull(),
  accountRowId: text('account_row_id'),
  characterId: integer('character_id'),
  characterIds: jsonb('character_ids').$type<number[]>().notNull(),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull(),
  queuedAt: timestamp('queued_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index('pending_deletions_queue_idx').on(table.queuedAt, table.id)]);
