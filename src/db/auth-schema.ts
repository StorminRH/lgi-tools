import {
  bigint,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { CHARACTER_ROLES } from '@/config/character-roles';

export const characterRoleEnum = pgEnum('character_role', CHARACTER_ROLES);

export const characters = pgTable('characters', {
  characterId: bigint('character_id', { mode: 'number' }).primaryKey(),
  name: text('name').notNull(),
  portraitUrl: text('portrait_url').notNull(),
  role: characterRoleEnum('role').default('USER').notNull(),
  preferences: jsonb('preferences').$type<Record<string, unknown>>().default({}).notNull(),

  corporationId: bigint('corporation_id', { mode: 'number' }),
  allianceId: bigint('alliance_id', { mode: 'number' }),
  factionId: bigint('faction_id', { mode: 'number' }),
  affiliationRefreshedAt: timestamp('affiliation_refreshed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  lastLoginAt: timestamp('last_login_at').defaultNow().notNull(),
});

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),

  role: characterRoleEnum('role').default('USER').notNull(),

  activeCharacterId: bigint('active_character_id', { mode: 'number' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [index('session_user_id_idx').on(table.userId)],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    refreshTokenInvalidGrantCount: integer('refresh_token_invalid_grant_count')
      .default(0)
      .notNull(),
    refreshTokenInvalidGrantFirstAt: timestamp('refresh_token_invalid_grant_first_at'),
    scope: text('scope'),

    ownerHash: text('owner_hash'),
    password: text('password'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('account_user_id_idx').on(table.userId),

    uniqueIndex('account_provider_account_idx').on(table.providerId, table.accountId),
  ],
);

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

/**
 * Better Auth JWT plugin (3.4.1b) — the signing keypair for the Convex-facing
 * JWT. Keys are generated once and persisted here (static JWKS served at
 * /api/auth/jwks), not regenerated per request; the private key is itself
 * encrypted at rest by Better Auth under the app secret. `expiresAt` is nullable
 * and only written if key rotation is ever enabled. Matches Better Auth's
 * expected model field-for-field.
 */
export const jwks = pgTable('jwks', {
  id: text('id').primaryKey(),
  publicKey: text('public_key').notNull(),
  privateKey: text('private_key').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at'),
});

export const corpAccessAudit = pgTable(
  'corp_access_audit',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    decidedAt: timestamp('decided_at', { withTimezone: true }).defaultNow().notNull(),
    userId: text('user_id').notNull(),
    characterId: bigint('character_id', { mode: 'number' }),
    corporationId: bigint('corporation_id', { mode: 'number' }).notNull(),
    allowed: boolean('allowed').notNull(),
    reason: text('reason').notNull(),
  },
  (t) => [

    index('corp_access_audit_corp_decided_idx').on(t.corporationId, t.decidedAt.desc()),

    index('corp_access_audit_allowed_decided_idx').on(t.allowed, t.decidedAt.desc()),
  ],
);
