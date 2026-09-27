import { date, doublePrecision, jsonb, pgTable, primaryKey, smallint, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from '@/db/auth-schema';

export interface PilotWorth {
  netWorth: number;
  liquidIsk: number;
}

/**
 * One row per account per UTC day; the last board view of the day wins. Keyed to the account, not the
 * character, so a sold character's history never follows it and link/unlink never reads as a gain or loss.
 */
export const netWorthDays = pgTable(
  'net_worth_days',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    day: date('day', { mode: 'string' }).notNull(),
    netWorth: doublePrecision('net_worth').notNull(),
    liquidIsk: doublePrecision('liquid_isk').notNull(),
    pilotsIncluded: smallint('pilots_included').notNull(),
    pilotsTotal: smallint('pilots_total').notNull(),
    pilots: jsonb('pilots').$type<Record<string, PilotWorth>>().notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);
