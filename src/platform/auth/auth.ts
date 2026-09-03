import 'server-only';

import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { customSession, genericOAuth, jwt } from 'better-auth/plugins';
import { logUsageEvent } from '@/data/telemetry/queries';
import { db } from '@/db';
import { readEnv, requireEnv } from '@/lib/env';
import {
  EVE_AUTHORIZE_URL,
  EVE_PROVIDER_ID,
  EVE_SCOPES,
  EVE_TOKEN_URL,
  claimsToCharacter,
  exchangeCodeForToken,
  verifyEveJwt,
} from './eve-sso';
import { refreshAffiliations } from './affiliation';
import { recordAbsorb } from './absorb-context';
import { resolveActiveCharacter, upsertCharacterLoginIdentity } from './linked-characters';
import { absorbLinkedCharacterOnProof } from './owner-transfer';
import { getCharacterOwnerReconciler } from './owner-reconcile-hook';
import { runAfterCharacterLinkChanged } from './identity-projection-hooks';
import { getCachedJwks } from './jwks-cache';
import { account, jwks, session, user, verification } from '@/db/auth-schema';
import { syntheticEmail } from './synthetic-email';
import { encryptToken } from './token-crypto';
import { encryptAccountTokens } from './account-token-encryption';
import { deriveSessionIdentity } from './session-identity';
import type { CharacterRole } from './types';

function computeIsAdmin(characterId: number | null, role: CharacterRole): boolean {
  if (role === 'ADMIN') return true;
  const superId = Number(readEnv('SUPERADMIN_CHARACTER_ID'));
  return characterId !== null && characterId === superId;
}

const options = {
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: { user, session, account, verification, jwks },
  }),
  secret: readEnv('BETTER_AUTH_SECRET') ?? readEnv('SESSION_SECRET'),
  baseURL: readEnv('BETTER_AUTH_URL'),
  // Encrypt EVE tokens at rest (3.4.1b). They arrive PLAINTEXT here:
  // `account.encryptOAuthTokens` is intentionally NOT set — enabling it would
  // AES-encrypt the tokens under the Better Auth secret *before* this hook runs,
  // which would defeat decryption with our dedicated EVE_TOKEN_ENCRYPTION_KEY.
  // Do not turn it on.
  databaseHooks: {
    account: {
      create: {
        before: async (acct) => ({ data: encryptAccountTokens(acct, encryptToken) }),
        after: async (acct) => {
          if (acct.providerId !== EVE_PROVIDER_ID) return;
          const characterId = Number(acct.accountId);
          if (!Number.isFinite(characterId)) return;
          await runAfterCharacterLinkChanged({ userId: acct.userId, characterId });
        },
      },
      update: { before: async (acct) => ({ data: encryptAccountTokens(acct, encryptToken) }) },
    },
  },
  // Account-linking policy (3.4.2). Each EVE character is its own `account` row
  // under the same user. EVE issues no email, so every character carries a
  // DISTINCT synthetic address (`<id>@eve.invalid`) — which means a linked
  // character's email never matches the session user's. allowDifferentEmails is
  // therefore mandatory: without it Better Auth's link callback refuses every
  // link with `email_doesn't_match`. We do NOT set updateUserInfoOnLink, so
  // linking an alt never overwrites the main user row's name/image.
  account: {
    additionalFields: {
      refreshTokenInvalidGrantCount: {
        type: 'number',
        required: false,
        defaultValue: 0,
        input: false,
        returned: false,
      },
      refreshTokenInvalidGrantFirstAt: {
        type: 'date',
        required: false,
        input: false,
        returned: false,
      },
    },
    accountLinking: { allowDifferentEmails: true },
  },
  user: {
    additionalFields: {
      role: { type: 'string', required: false, defaultValue: 'USER', input: false },
      // The active/current character (3.4.2) — a linked character id. Better Auth
      // has no 'bigint' field TYPE, so it's typed 'number' with the separate
      // `bigint` storage flag (the real column is our Drizzle bigint); EVE ids sit
      // far below MAX_SAFE_INTEGER. input:false keeps it server-controlled — only
      // the switch/unlink routes and the session resolver's backfill write it.
      activeCharacterId: { type: 'number', bigint: true, required: false, input: false },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days — matches the retired JWE cookie lifetime
    // Disable the session-freshness gate (3.4.2). unlink-account runs behind
    // freshSessionMiddleware, which 403s once a session is older than freshAge
    // (default 1 day) — but our sessions live 7 days, so unlinking a character a
    // day after sign-in would fail. We have no other fresh-gated flow (no
    // delete-user / change-password), so 0 disables it cleanly.
    freshAge: 0,
    // Sign the base session into the cookie so getSession validates it without a
    // DB read for the cache window. (customSession's enrichment is never cached,
    // so the active-character lookup still runs each call — see session.ts.)
    cookieCache: { enabled: true, maxAge: 300 },
  },
  plugins: [
    genericOAuth({
      config: [
        {
          providerId: EVE_PROVIDER_ID,
          clientId: readEnv('EVE_CLIENT_ID') ?? '',
          clientSecret: readEnv('EVE_CLIENT_SECRET') ?? '',
          authorizationUrl: EVE_AUTHORIZE_URL,
          tokenUrl: EVE_TOKEN_URL,
          scopes: [...EVE_SCOPES],
          pkce: true,
          responseType: 'code',
          // Force EVE to re-prompt so a pilot re-consents to the current
          // EVE_SCOPES on their next sign-in — replacing an older, broader grant
          // with the minimal read-only set (3.7.1.1 pruned the request to four).
          prompt: 'consent',
          overrideUserInfo: true,
          // EVE's token endpoint needs HTTP Basic auth, the PKCE verifier, AND a
          // descriptive User-Agent (CCP blocks UA-less traffic). We hand the whole
          // exchange to the proven helper rather than Better Auth's default fetch,
          // which can't set the User-Agent. Likewise getUserInfo runs EVE's JWKS
          // fetch through the helper's User-Agent. Do NOT drop these for the
          // default exchange. (`authentication` is moot while getToken is custom.)
          getToken: async ({ code, codeVerifier }) => {
            const token = await exchangeCodeForToken({
              code,
              codeVerifier: codeVerifier ?? '',
              clientId: requireEnv('EVE_CLIENT_ID'),
              clientSecret: requireEnv('EVE_CLIENT_SECRET'),
            });
            return {
              accessToken: token.access_token,
              refreshToken: token.refresh_token,
              accessTokenExpiresAt: token.expires_in
                ? new Date(Date.now() + token.expires_in * 1000)
                : undefined,
              // The granted scopes Better Auth persists to `account.scope`
              // (comma-joined). EVE returns none in the token body, so we report
              // the exact set we requested. This is the seam that makes a relink
              // refresh the stored scope: on re-consent Better Auth's callback
              // writes `tokens.scopes.join(",")` to the existing account
              // (verified, generic-oauth routes.mjs ~L237). So pruning EVE_SCOPES
              // narrows what every relink re-consents to and stores — least
              // privilege flows from one place. The eve-sso.test.ts pin is the
              // regression guard; re-verify this callback on a Better Auth bump.
              scopes: [...EVE_SCOPES],
              raw: token as unknown as Record<string, unknown>,
            };
          },
          // EVE has no userinfo endpoint — identity is the verified JWT. The
          // returned `id` becomes account.accountId (the character id). Also
          // refresh the per-character profile row, exactly as the old callback.
          getUserInfo: async (tokens) => {
            if (!tokens.accessToken) return null;
            const claims = await verifyEveJwt(tokens.accessToken);
            const character = claimsToCharacter(claims);
            await getCharacterOwnerReconciler()(character.characterId, claims.owner);
            const { absorbed } = await absorbLinkedCharacterOnProof(character.characterId);
            if (absorbed) recordAbsorb(character.characterId);
            await upsertCharacterLoginIdentity(character);
            void refreshAffiliations([character.characterId]).catch((err) =>
              console.error('[auth] affiliation refresh failed', err),
            );
            void logUsageEvent({
              action: 'auth_login',
              characterId: character.characterId,
              metadata: {},
            }).catch((err) => console.error('[auth] login telemetry write failed', err));
            return {
              id: String(character.characterId),
              name: character.name,
              image: character.portraitUrl,
              email: syntheticEmail(character.characterId),
              emailVerified: true,
            };
          },
        },
      ],
    }),
    // Convex-facing JWT (3.4.1b → consumed in 3.4.3). Signed with ES256 — NOT the
    // EdDSA default — because Convex's custom-JWT validation accepts only
    // RS256/ES256. The keypair is generated once and persisted in the `jwks`
    // table (static JWKS served at /api/auth/jwks), private key encrypted at rest
    // under the app secret. The subject defaults to the Better Auth user id so
    // Convex scopes to the user; the payload carries the role plus the user's
    // display name for write-time map-event attribution — never any EVE token
    // material. `aud`/`iss` are the recorded contract for 3.4.3's
    // auth.config.ts (applicationID = 'convex', issuer = BETTER_AUTH_URL).
    jwt({
      jwks: { keyPairConfig: { alg: 'ES256' } },
      jwt: {
        issuer: readEnv('BETTER_AUTH_URL'),
        audience: 'convex',
        expirationTime: '7d',
        // /token uses Better Auth's original getSession (not customSession), so
        // this path never runs Neon character enrichment.
        definePayload: ({ user: u }) => ({
          role: (u.role as CharacterRole | undefined) ?? 'USER',
          name: u.name,
        }),
      },
      adapter: { getJwks: getCachedJwks },
      // Don't attach a signed JWT to every session response — Convex pulls one
      // deliberately from /api/auth/token. Recommended with OAuth provider plugins.
      disableSettingJwtHeader: true,
    }),
  ],
} satisfies BetterAuthOptions;

/**
 * Server Better Auth instance owning EVE OAuth, encrypted application token custody, sessions, and
 * account hooks.
 */
export const auth = betterAuth({
  ...options,
  plugins: [
    ...options.plugins,
    customSession(async ({ user: u, session: s }) => {
      const active = await resolveActiveCharacter(u.id, u.activeCharacterId ?? null);
      return deriveSessionIdentity({ user: u, session: s, active, isAdmin: computeIsAdmin });
    }, options),
  ],
});
