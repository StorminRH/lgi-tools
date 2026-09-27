import { bigint, jsonb, pgTable, timestamp } from 'drizzle-orm/pg-core';
import type { SheetSections } from './types';

export const characterSheets = pgTable('character_sheets', {
  characterId: bigint('character_id', { mode: 'number' }).primaryKey(),
  sections: jsonb('sections').$type<SheetSections>().notNull().default({}),
  /** The latest section stamp; the ESI-mirror scan keys on it, per-section freshness lives in `sections`. */
  lastRefreshedAt: timestamp('last_refreshed_at', { withTimezone: true }).notNull(),
});
