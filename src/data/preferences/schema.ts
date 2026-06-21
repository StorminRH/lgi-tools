import { jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from '@/features/auth/schema';

// Generic per-user preference store (F4). The authoritative tier for a logged-in
// user's saved settings — durable, non-regenerable, so it lives in Neon (never
// Convex, which a teardown+resync must be able to reproduce). One row per
// (user, key); `value` is the JSON-encoded preference, validated against the
// owning key's schema in the route before it ever reaches here. Deliberately
// schema-light: a future settings page reuses this table unchanged, adding keys
// (in src/lib/preferences.ts) and UI — never columns.
export const userPreferences = pgTable(
  'user_preferences',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    value: jsonb('value').$type<unknown>().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.key] }) }),
);
