import { bigint, jsonb, pgEnum, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const CHARACTER_ROLES = ['USER', 'ADMIN'] as const;
export type CharacterRole = (typeof CHARACTER_ROLES)[number];

export const characterRoleEnum = pgEnum('character_role', CHARACTER_ROLES);

// `ADMIN` is in the enum from day one even though only USER is assigned in 2.8.1:
// adding enum values mid-flight is a heavier migration than including both up front.
// SUPERADMIN is env-based, not a DB role.
export const characters = pgTable('characters', {
  characterId: bigint('character_id', { mode: 'number' }).primaryKey(),
  name: text('name').notNull(),
  portraitUrl: text('portrait_url').notNull(),
  role: characterRoleEnum('role').default('USER').notNull(),
  preferences: jsonb('preferences').$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  lastLoginAt: timestamp('last_login_at').defaultNow().notNull(),
});
