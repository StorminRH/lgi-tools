import { bigint, bigserial, index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { characters } from '@/features/auth/schema';

/**
 * First-party usage log. One row per tracked action (page view, terminal
 * search, auth event, role change, ...). `character_id` is nullable so
 * anonymous visitors get tracked too — the EVE Partner Program cares about
 * total reach, not just authenticated reach. FK with ON DELETE SET NULL
 * preserves the audit trail if a character row is ever pruned.
 *
 * `action` is text + a TS const array (USAGE_ACTIONS) rather than a pg enum:
 * the vocabulary grows with every feature and we don't want a migration per
 * addition. Same pattern as URL filter validation against SITE_TYPES.
 */
export const usageLogs = pgTable(
  'usage_logs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
    characterId: bigint('character_id', { mode: 'number' }).references(
      () => characters.characterId,
      { onDelete: 'set null' },
    ),
    action: text('action').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
  },
  (t) => [
    index('usage_logs_timestamp_idx').on(t.timestamp.desc()),
    index('usage_logs_action_timestamp_idx').on(t.action, t.timestamp.desc()),
    index('usage_logs_character_timestamp_idx').on(t.characterId, t.timestamp.desc()),
  ],
);
