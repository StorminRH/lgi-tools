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

// ── Form-post routes (303 redirects — request schemas only) ─────────────
// These routes stay HTML form-posts; their input schemas live here so the
// contract file is the slice's one validation surface. Zod 4 note: z.coerce
// fields have input type `unknown` — the routes pass form.get() values to
// safeParse exactly as before.

// Better Auth ids are opaque strings — nanoid for new logins, `eve-user-<id>`
// for backfilled pilots; the charset gate keeps junk out.
const userIdField = z.string().min(1).max(255).regex(/^[A-Za-z0-9_-]+$/);

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
