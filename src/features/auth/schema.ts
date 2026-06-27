import {
  bigint,
  bigserial,
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

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
  // Corp affiliation cache (3.7.3.2). Character-INTRINSIC public data (the public
  // /characters/affiliation/ bulk read needs no scope), so it lives here beside
  // name/portrait — NOT a per-link custody fact like account.owner_hash. Refreshed
  // on login + on-view + a nightly cron (TTL ≈ 1h, matching ESI's own
  // x-cached-seconds:3600); the membership helper (membership.ts) reads it
  // fail-closed (null/stale ⇒ not a member). NULL until the first refresh. Kept +
  // refreshed (not purged) on character transfer — the new owner's login re-reads
  // it — so it needs no entry on the owner-hash purge surface.
  corporationId: bigint('corporation_id', { mode: 'number' }),
  allianceId: bigint('alliance_id', { mode: 'number' }),
  factionId: bigint('faction_id', { mode: 'number' }),
  affiliationRefreshedAt: timestamp('affiliation_refreshed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  lastLoginAt: timestamp('last_login_at').defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Better Auth core tables (3.4.1a). Better Auth owns identity/sessions; these
// match its expected model. The JS keys are camelCase (the Drizzle adapter maps
// Better Auth's field names to these), the DB columns are snake_case.
//
// `user` is the human/main-account row (one per pilot today; alts attach in a
// later version). `account` is the EVE link — providerId 'eve', accountId = the
// character id — and is the canonical user↔character join. `characters` above
// stays the per-character profile + the telemetry FK target; its `role` column
// is superseded by `user.role` (admin is per-user) and left in place only until
// a later cleanup once parity is proven.
//
// `user` is a Postgres reserved word; Drizzle always quotes identifiers, so the
// `"user"` table name is safe (raw SQL elsewhere must quote it too).
// ---------------------------------------------------------------------------

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  // Per-user admin role. Reuses the existing character_role enum so there's one
  // source of truth for the role values.
  role: characterRoleEnum('role').default('USER').notNull(),
  // The character this user is currently acting as — the "active" / current
  // pilot (3.4.2). Points at a linked `account.accountId` (= character id). NULL
  // means "not yet chosen": the session resolver falls back to the oldest linked
  // account. Deliberately NOT a foreign key — a `characters` profile row can lag
  // a freshly linked account, and resolution tolerates a dangling id by falling
  // back, so an FK would only add a write-ordering hazard.
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
    scope: text('scope'),
    // The EVE JWT `owner` claim (CharacterOwnerHash) for this character — stable
    // for one human across logins, changes only when the character is transferred
    // to a different EVE account (3.7.1.3). Stored + compared on every auth: a
    // changed hash means a different human now controls the character, so the
    // prior owner's footprint is purged and a fresh re-consent is forced. NULL on
    // legacy rows (pre-3.7.1.3) and on a freshly-created row — both BACKFILL on the
    // next auth, never purge. This is an identity check, NOT a secret (like
    // `scope`, it's plaintext) — do NOT envelope-encrypt it. App-managed: written
    // only by the reconcile path (queries.ts), never by Better Auth's account write.
    ownerHash: text('owner_hash'),
    password: text('password'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('account_user_id_idx').on(table.userId),
    // Sign-in and the session shim both look an account up by (provider, account
    // id); the user↔character resolution rides this index. UNIQUE: there is at
    // most one row per (provider, character), so the constraint is a DB-level
    // backstop against a concurrent first-sign-in race creating duplicate links
    // (which would make the token vend's single-row read pick arbitrarily).
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

// Better Auth JWT plugin (3.4.1b) — the signing keypair for the Convex-facing
// JWT. Keys are generated once and persisted here (static JWKS served at
// /api/auth/jwks), not regenerated per request; the private key is itself
// encrypted at rest by Better Auth under the app secret. `expiresAt` is nullable
// and only written if key rotation is ever enabled. Matches Better Auth's
// expected model field-for-field.
export const jwks = pgTable('jwks', {
  id: text('id').primaryKey(),
  publicKey: text('public_key').notNull(),
  privateKey: text('private_key').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at'),
});

// Corp-access decision ledger (3.7.3.3) — one row per decision made by the audited
// corp-access gate (corp-access.ts), allow AND deny. A security/authz audit trail,
// NOT analytics telemetry: it lives on its own table so its retention is decoupled
// from the 180-day usage_logs prune — denials (unauthorized-access attempts) must
// outlive analytics. Append-only; deliberately NO foreign keys on user_id /
// character_id so the trail survives the user or character row being deleted
// (the ids are recorded provenance, the same FK-less posture as the role_change
// audit's JSONB ids). `character_id` is the linked pilot whose fresh affiliation
// granted access — NULL on a deny. `reason` is plain text (the gate owns the
// vocabulary) so a new reason needs no migration, like usage_logs.action. Records
// no tokens/secrets.
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
    // Per-corp decision history ("who was decided for corp X, newest first").
    index('corp_access_audit_corp_decided_idx').on(t.corporationId, t.decidedAt.desc()),
    // The denials view ("recent denied attempts"): allowed as the leading equality
    // column, then newest-first.
    index('corp_access_audit_allowed_decided_idx').on(t.allowed, t.decidedAt.desc()),
  ],
);
