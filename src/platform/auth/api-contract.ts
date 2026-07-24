// API wire contracts owned by the auth feature (3.4.T). Runtime-light by
// design — zod plus same-slice constants only, no server imports — because this
// module is part of auth's shared surface (importable by data slices, see
// eslint.config.mjs) and the eve-token contract below is the type-import
// surface for the Convex actions layer (3.4.3).
import { z } from 'zod';
import { CHARACTER_ROLES } from '@/config/character-roles';
import {
  defineEndpoint,
  jsonBody,
  problem,
} from '@/transport/endpoint';

// Better Auth ids are opaque strings — nanoid for new logins, `eve-user-<id>`
// for backfilled pilots; the charset gate keeps junk out.
const userIdField = z.string().min(1).max(255).regex(/^[A-Za-z0-9_-]+$/);

// ── POST /api/internal/eve-token (authz: service) ───────────────────────
// The Convex action → token-vend boundary. The response carries ONLY the
// access token; the refresh token never appears on this wire.

/**
 * Boundary validator for eve token request schema; successful parsing yields the normalized auth
 * input consumed internally.
 */
export const eveTokenRequestSchema = z.object({
  userId: userIdField,
  characterId: z.number().int().positive(),
});

/**
 * 200 response type imported by convex/ in 3.4.3. Carries ONLY the short-lived
 * access token: the consumer's ESI reads own their freshness windows, so no
 * expiry/identity/scope metadata rides this wire (PL-013).
 */
const eveTokenResponseSchema = z.object({ accessToken: z.string() });
/** Fresh EVE access token vended to the authenticated internal sync caller. */
export type EveTokenOkResponse = z.infer<typeof eveTokenResponseSchema>;

/** Internal token-vending endpoint with closed success and failure statuses. */
export const eveTokenEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/internal/eve-token',
  request: eveTokenRequestSchema,
  responses: {
    200: jsonBody(eveTokenResponseSchema),
    400: problem('invalid_json', 'invalid_body'),
    401: problem('unauthenticated'),
    404: problem('not_found'),
    409: problem('reauth_required'),
    500: problem('not_configured'),
    502: problem('upstream_error'),
  },
});

// ── POST /api/internal/eve-characters (authz: service) ──────────────────
// The Convex action → character-enumeration boundary (3.4.7). Convex asserts
// the userId it authenticated via the spine's JWT; Neon owns the character
// data. Ownership is enforced by construction: the action only ever acts on
// the characters this endpoint returns for that userId — no client-posted
// character id carries authority anywhere in the sync flow.

/**
 * Boundary validator for eve characters request schema; successful parsing yields the normalized
 * auth input consumed internally.
 */
export const eveCharactersRequestSchema = z.object({
  userId: userIdField,
});

/**
 * 200 response type imported by convex/. `hasRefreshToken` + `missingScopes`
 * (from the shipped scope-health derivation) let a consumer decide eligibility
 * against ITS OWN scope needs — the skill tracker only requires the two skill
 * scopes, not the full superset — and skip token vends that would only 409. No
 * token material.
 */
const eveCharacterEntrySchema = z.object({
  characterId: z.number().int().positive(),
  name: z.string(),
  hasRefreshToken: z.boolean(),
  missingScopes: z.array(z.string()),
  // Cached corp affiliation (3.7.3.2). The Convex corp sync reads this instead of
  // an inline public /characters/{id} ESI call (resolveCorpSubjects); null until
  // the character's affiliation has been refreshed at least once.
  corporationId: z.number().int().positive().nullable(),
});
const eveCharactersResponseSchema = z.object({
  characters: z.array(eveCharacterEntrySchema),
});
/** Internal character enumeration returned to Convex with sync eligibility and corp context. */
export type EveCharactersResponse = z.infer<typeof eveCharactersResponseSchema>;

/** Internal linked-character enumeration endpoint with closed success and failure statuses. */
export const eveCharactersEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/internal/eve-characters',
  request: eveCharactersRequestSchema,
  responses: {
    200: jsonBody(eveCharactersResponseSchema),
    400: problem('invalid_json', 'invalid_body'),
    401: problem('unauthenticated'),
    500: problem('not_configured'),
  },
});

/**
 * ── GET /api/cron/refresh-affiliations (authz: cron) ────────────────────
 * No programmatic consumer (Vercel cron reads logs only) — pinned with
 * `satisfies` in the route. `busy` means another run held the advisory lock;
 * `refreshed` carries the characters considered + rows actually written.
 */
export type CronRefreshAffiliationsResponse =
  | { status: 'busy' }
  | { status: 'refreshed'; stale: number; refreshed: number };

// ── Form-post routes (303 redirects — request schemas only) ─────────────
// These routes stay HTML form-posts; their input schemas live here so the
// contract file is the slice's one validation surface. Zod 4 note: z.coerce
// fields have input type `unknown` — the routes pass form.get() values to
// safeParse exactly as before.

/** /api/account/active-character — the character to make active. */
export const switchCharacterFormSchema = z.object({
  characterId: z.coerce.number().int().positive(),
});

/** /api/account/characters/unlink — the character to remove. */
export const unlinkCharacterFormSchema = z.object({
  characterId: z.coerce.number().int().positive(),
});

/**
 * /api/admin/role — `q` (optional search-state preserver) is loosely validated
 * here; the route's post-parse sanitiseQuery() does the real cleaning.
 */
export const ADMIN_ACCESS_QUERY_MAX_LENGTH = 200;
/**
 * Boundary validator for admin role form schema; successful parsing yields the normalized auth
 * input consumed internally.
 */
export const adminRoleFormSchema = z.object({
  userId: userIdField,
  nextRole: z.enum(CHARACTER_ROLES),
  q: z.string().max(ADMIN_ACCESS_QUERY_MAX_LENGTH * 4).optional(),
});

/** /api/admin/characters/unlink — admin force-unlink from ANY user. */
export const adminUnlinkFormSchema = z.object({
  userId: userIdField,
  characterId: z.coerce.number().int().positive(),
});

/** /api/admin/characters/reassign — move a character onto the acting admin. */
export const adminReassignFormSchema = z.object({
  characterId: z.coerce.number().int().positive(),
  fromUserId: userIdField,
});

/** /api/admin/sessions/revoke — the user whose sessions to revoke. */
export const adminRevokeSessionsFormSchema = z.object({
  userId: userIdField,
});

// Better Auth's own REST endpoints (sign-out, OAuth sign-in, and the jwt
// plugin's token mint) are reached through the official typed client in
// `auth-client.ts`, not through contracts declared here. The library owns those
// wire shapes; re-pinning them by hand would only be a copy that can drift.

// ── GET /api/account/characters (authz: auth) ───────────────────────────
// The signed-in user's linked EVE characters, the client-safe projection the
// home roster (P3b) joins with the live skill sync. No token material, no raw
// scope string. Anonymous callers get an empty list. `needsReconnect` is the
// skill-sync eligibility (the same rule the /skills page applies server-side),
// so the roster's reconnect affordance matches the data it shows.
const accountCharacterSchema = z.object({
  characterId: z.number().int().positive(),
  name: z.string(),
  portraitUrl: z.string(),
  needsReconnect: z.boolean(),
});
const accountCharactersResponseSchema = z.object({
  characters: z.array(accountCharacterSchema),
});
/**
 * Linked characters visible on the account surface, already shaped for authenticated client
 * rendering.
 */
export type AccountCharactersResponse = z.infer<typeof accountCharactersResponseSchema>;
/**
 * Typed endpoint definition for account characters endpoint; method, path, request, and response
 * contracts remain coupled here.
 */
export const accountCharactersEndpoint = defineEndpoint({
  method: 'GET',
  path: '/api/account/characters',
  request: null,
  responses: {
    200: jsonBody(accountCharactersResponseSchema),
  },
});

// ── Self-service account safety (ACCOUNT.2, authz: auth) ─────────────────
// The plumbing layer's wire shapes; the account-page UI (later sub-version) wires
// these to apiFetch via endpoint descriptors then. Each route acts on the CALLER's
// own account only — no body carries a target user id. Request/response live here so
// the route imports its contract (the api-contracts.test invariant) and pins its
// JSON payload with `satisfies`.

/**
 * POST /api/account/purge-character — purge one of the caller's own characters
 * (full teardown + EVE revoke). The route also verifies the posted id belongs to
 * the session user before acting.
 */
export const purgeCharacterRequestSchema = z.object({
  characterId: z.number().int().positive(),
});
// 200. accountEmptied is true when this was the last character — the account was
// emptied and the user deleted (a de-facto nuke); the UI shows the EVE-revoke
// redirect + logs out only then.
const purgeCharacterResponseSchema = z.object({ accountEmptied: z.boolean() });
/**
 * Character-purge result indicating whether removing the character also emptied and deleted the
 * owning account.
 */
export type PurgeCharacterResponse = z.infer<typeof purgeCharacterResponseSchema>;
/**
 * Boundary validator for purge character endpoint; successful parsing yields the normalized auth
 * input consumed internally.
 */
export const purgeCharacterEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/account/purge-character',
  request: purgeCharacterRequestSchema,
  responses: {
    200: jsonBody(purgeCharacterResponseSchema),
    400: problem('invalid_json', 'invalid_body', 'not_linked'),
    401: problem('unauthenticated'),
    429: problem('rate_limited'),
  },
});

// POST /api/account/delete — nuke the caller's entire account. No request body.
const accountDeleteResponseSchema = z.object({ ok: z.literal(true) });
/**
 * Successful full-account deletion acknowledgement.
 */
export type AccountDeleteResponse = z.infer<typeof accountDeleteResponseSchema>;
/** Full-account deletion endpoint with no request body and closed response statuses. */
export const accountDeleteEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/account/delete',
  request: null,
  responses: {
    200: jsonBody(accountDeleteResponseSchema),
    401: problem('unauthenticated'),
    429: problem('rate_limited'),
  },
});

// POST /api/account/sessions/revoke — log the caller out everywhere. No request
// body; `revoked` is the number of sessions removed.
const sessionsRevokeResponseSchema = z.object({ revoked: z.number() });
/**
 * Session-revocation result reporting how many matching sessions were removed.
 */
export type SessionsRevokeResponse = z.infer<typeof sessionsRevokeResponseSchema>;
/**
 * Typed endpoint definition for sessions revoke endpoint; method, path, request, and response
 * contracts remain coupled here.
 */
export const sessionsRevokeEndpoint = defineEndpoint({
  method: 'POST',
  path: '/api/account/sessions/revoke',
  request: null,
  responses: {
    200: jsonBody(sessionsRevokeResponseSchema),
    401: problem('unauthenticated'),
    429: problem('rate_limited'),
  },
});
