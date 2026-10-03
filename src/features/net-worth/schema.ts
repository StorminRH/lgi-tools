import { date, doublePrecision, jsonb, pgTable, primaryKey, smallint, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from '@/db/auth-schema';
import type { PilotWorth } from './types';

/**
 * One row per account per UTC day, written by the nightly revalue and on a roster change; the last write of
 * the day wins. Keyed to the account, not the character. Unlink and owner transfer erase every day that
 * included the removed pilot.
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
