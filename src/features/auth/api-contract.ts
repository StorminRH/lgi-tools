// API wire contracts owned by the auth feature (3.4.T). Runtime-light by
// design — zod plus same-slice constants only, no server imports — because this
// module is part of auth's shared surface (importable by data slices, see
// eslint.config.mjs) and the eve-token contract below is the type-import
// surface for the Convex actions layer (3.4.3).
import { z } from 'zod';
import type { ApiEndpoint } from '@/lib/api-client';
import { CHARACTER_ROLES } from './schema';

// ── POST /api/internal/eve-token (authz: service) ───────────────────────
// The Convex action → token-vend boundary. The response carries ONLY the
// access token; the refresh token never appears on this wire.

export const eveTokenRequestSchema = z.object({
  characterId: z.number().int().positive(),
});

// 200 — pinned with `satisfies` in the route; type-imported by convex/ in
// 3.4.3. `expiresAt` is an ISO-8601 string on the wire (Date.toISOString()).
export interface EveTokenOkResponse {
  accessToken: string;
  expiresAt: string;
  characterId: number;
  scopes: string[];
}

// 404 | 409 | 502 JSON envelope. 400/401/500 are plain text — uncontracted.
export type EveTokenErrorCode = 'not_found' | 'reauth_required' | 'upstream_error';
export interface EveTokenErrorResponse {
  error: EveTokenErrorCode;
}

// ── POST /api/internal/eve-characters (authz: service) ──────────────────
// The Convex action → character-enumeration boundary (3.4.7). Convex asserts
// the userId it authenticated via the spine's JWT; Neon owns the character
// data. Ownership is enforced by construction: the action only ever acts on
// the characters this endpoint returns for that userId — no client-posted
// character id carries authority anywhere in the sync flow.

// Better Auth ids are opaque strings — nanoid for new logins, `eve-user-<id>`
// for backfilled pilots; the charset gate keeps junk out.
const userIdField = z.string().min(1).max(255).regex(/^[A-Za-z0-9_-]+$/);

export const eveCharactersRequestSchema = z.object({
  userId: userIdField,
});

// 200 — pinned with `satisfies` in the route; type-imported by convex/.
// `hasRefreshToken` + `missingScopes` (from the shipped scope-health
// derivation) let a consumer decide eligibility against ITS OWN scope needs —
// the skill tracker only requires the two skill scopes, not the full
// superset — and skip token vends that would only 409. No token material.
export interface EveCharacterEntry {
  characterId: number;
  name: string;
  hasRefreshToken: boolean;
  missingScopes: string[];
  // Cached corp affiliation (3.7.3.2). The Convex corp sync reads this instead of
  // an inline public /characters/{id} ESI call (resolveCorpSubjects); null until
  // the character's affiliation has been refreshed at least once.
  corporationId: number | null;
}
export interface EveCharactersResponse {
  characters: EveCharacterEntry[];
}

// ── GET /api/cron/refresh-affiliations (authz: cron) ────────────────────
// No programmatic consumer (Vercel cron reads logs only) — pinned with
// `satisfies` in the route. `busy` means another run held the advisory lock;
// `refreshed` carries the characters considered + rows actually written.
export type CronRefreshAffiliationsResponse =
  | { status: 'busy' }
  | { status: 'refreshed'; stale: number; refreshed: number };

// ── Form-post routes (303 redirects — request schemas only) ─────────────
// These routes stay HTML form-posts; their input schemas live here so the
// contract file is the slice's one validation surface. Zod 4 note: z.coerce
// fields have input type `unknown` — the routes pass form.get() values to
// safeParse exactly as before.

// /api/account/active-character — the character to make active.
export const switchCharacterFormSchema = z.object({
  characterId: z.coerce.number().int().positive(),
});

// /api/account/characters/unlink — the character to remove.
export const unlinkCharacterFormSchema = z.object({
  characterId: z.coerce.number().int().positive(),
});

// /api/admin/role — `q` (optional search-state preserver) is loosely validated
// here; the route's post-parse sanitiseQuery() does the real cleaning.
export const ADMIN_ACCESS_QUERY_MAX_LENGTH = 200;
export const adminRoleFormSchema = z.object({
  userId: userIdField,
  nextRole: z.enum(CHARACTER_ROLES),
  q: z.string().max(ADMIN_ACCESS_QUERY_MAX_LENGTH * 4).optional(),
});

// /api/admin/characters/unlink — admin force-unlink from ANY user.
export const adminUnlinkFormSchema = z.object({
  userId: userIdField,
  characterId: z.coerce.number().int().positive(),
});

// /api/admin/characters/reassign — move a character onto the acting admin.
export const adminReassignFormSchema = z.object({
  characterId: z.coerce.number().int().positive(),
  fromUserId: userIdField,
});

// /api/admin/sessions/revoke — the user whose sessions to revoke.
export const adminRevokeSessionsFormSchema = z.object({
  userId: userIdField,
});

// ── Better Auth REST endpoints (library-owned, hand-pinned) ─────────────
// These two shapes are pinned by the better-auth version in package.json —
// verify them against the library on every upgrade. data/commands/search.ts
// consumes them: as a data slice it cannot import the auth feature's client
// (data → feature edge is banned), so it talks to Better Auth's REST routes
// through these contracts instead.

const signOutRequestSchema = z.object({});
export const signOutEndpoint: ApiEndpoint<z.input<typeof signOutRequestSchema>, undefined> = {
  method: 'POST',
  path: '/api/auth/sign-out',
  request: signOutRequestSchema,
  response: null, // status-only; the body is never read
};

const signInOauth2RequestSchema = z.object({
  providerId: z.string(),
  callbackURL: z.string(),
});
const signInOauth2ResponseSchema = z.object({ url: z.string().optional() });
export const signInOauth2Endpoint: ApiEndpoint<
  z.input<typeof signInOauth2RequestSchema>,
  z.infer<typeof signInOauth2ResponseSchema>
> = {
  method: 'POST',
  path: '/api/auth/sign-in/oauth2',
  request: signInOauth2RequestSchema,
  response: signInOauth2ResponseSchema,
};

// GET /api/auth/token — the jwt plugin's mint endpoint (session-gated; 401
// when anonymous). The Convex client bridge (3.4.3) pulls the ES256 JWT here
// on (re)connect; each call mints fresh, so there's no client-side caching.
const tokenResponseSchema = z.object({ token: z.string() });
export const tokenEndpoint: ApiEndpoint<null, z.infer<typeof tokenResponseSchema>> = {
  method: 'GET',
  path: '/api/auth/token',
  request: null, // GET — no body
  response: tokenResponseSchema,
};

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
export type AccountCharactersResponse = z.infer<typeof accountCharactersResponseSchema>;
export const accountCharactersEndpoint: ApiEndpoint<null, AccountCharactersResponse> = {
  method: 'GET',
  path: '/api/account/characters',
  request: null, // GET — no body
  response: accountCharactersResponseSchema,
};

// ── Self-service account safety (ACCOUNT.2, authz: auth) ─────────────────
// The plumbing layer's wire shapes; the account-page UI (later sub-version) wires
// these to apiFetch via endpoint descriptors then. Each route acts on the CALLER's
// own account only — no body carries a target user id. Request/response live here so
// the route imports its contract (the api-contracts.test invariant) and pins its
// JSON payload with `satisfies`.

// POST /api/account/purge-character — purge one of the caller's own characters
// (full teardown + EVE revoke). The route also verifies the posted id belongs to
// the session user before acting.
export const purgeCharacterRequestSchema = z.object({
  characterId: z.number().int().positive(),
});
// 200. accountEmptied is true when this was the last character — the account was
// emptied and the user deleted (a de-facto nuke); the UI shows the EVE-revoke
// redirect + logs out only then.
const purgeCharacterResponseSchema = z.object({ accountEmptied: z.boolean() });
export type PurgeCharacterResponse = z.infer<typeof purgeCharacterResponseSchema>;
export const purgeCharacterEndpoint: ApiEndpoint<
  z.input<typeof purgeCharacterRequestSchema>,
  PurgeCharacterResponse
> = {
  method: 'POST',
  path: '/api/account/purge-character',
  request: purgeCharacterRequestSchema,
  response: purgeCharacterResponseSchema,
};

// POST /api/account/delete — nuke the caller's entire account. No request body.
const accountDeleteResponseSchema = z.object({ ok: z.literal(true) });
export type AccountDeleteResponse = z.infer<typeof accountDeleteResponseSchema>;
export const accountDeleteEndpoint: ApiEndpoint<null, AccountDeleteResponse> = {
  method: 'POST',
  path: '/api/account/delete',
  request: null, // no body
  response: accountDeleteResponseSchema,
};

// POST /api/account/sessions/revoke — log the caller out everywhere. No request
// body; `revoked` is the number of sessions removed.
const sessionsRevokeResponseSchema = z.object({ revoked: z.number() });
export type SessionsRevokeResponse = z.infer<typeof sessionsRevokeResponseSchema>;
export const sessionsRevokeEndpoint: ApiEndpoint<null, SessionsRevokeResponse> = {
  method: 'POST',
  path: '/api/account/sessions/revoke',
  request: null, // no body
  response: sessionsRevokeResponseSchema,
};
