import { bigint, bigserial, index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { characters } from '@/db/auth-schema';

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
