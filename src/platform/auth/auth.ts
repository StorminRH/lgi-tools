import 'server-only';

import { after } from 'next/server';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { customSession, genericOAuth, jwt } from 'better-auth/plugins';
import { emitUsageEvent } from '@/data/telemetry/usage-events';
import { db } from '@/db';
import { EVE_SCOPES } from '@/config/eve-scopes';
import { readAuthSecret, readEnv } from '@/lib/env';
import { EVE_PROVIDER_ID } from '@/lib/eve-provider';
import {
  EVE_AUTHORIZE_URL,
  EVE_TOKEN_URL,
  claimsToCharacter,
  exchangeCodeForToken,
  verifyEveJwt,
} from './eve-sso';
import { resolveActiveCharacter, upsertCharacterLoginIdentity } from './linked-characters';
import { readLinkingUserId, rebindLinkTarget } from './link-intent';
import { recordMerge } from './merge-context';
import { withOwnerHashFromToken } from './owner-hash-claim';
import type { IdentityProjectionRunners } from './identity-projection-runners';
import { getCachedJwks } from './jwks-cache';
import { account, jwks, session, user, verification } from '@/db/auth-schema';
import { syntheticEmail } from './synthetic-email';
import { releaseSyntheticEmail } from './account-purge';
import { encryptToken } from './token-crypto';
import { encryptAccountTokens } from './account-token-encryption';
import { parseLinkedAccountId } from './eve-account-shared';
import { deriveSessionIdentity } from './session-identity';
import { isAdminIdentity, normalizeCharacterRole } from './admin-policy';

export interface CharacterProof {
  readonly characterId: number;
  readonly ownerHash: string | null;
  readonly linkingUserId: string | null;
}

export type ProofOutcome =
  | { readonly kind: 'none' }
  | { readonly kind: 'merged'; readonly survivorUserId: string; readonly sourceUserId: string };

export interface CreateAuthDeps {
  readonly runners: IdentityProjectionRunners;
  readonly refreshCharacterAffiliations: (characterIds: number[]) => Promise<void>;
  readonly proveCharacter: (proof: CharacterProof) => Promise<ProofOutcome>;
}

export function createAuth({ runners, proveCharacter, refreshCharacterAffiliations }: CreateAuthDeps) {
  const options = {
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: { user, session, account, verification, jwks },
    }),
    secret: readAuthSecret(),
    baseURL: readEnv('BETTER_AUTH_URL'),
    // Unlinks go through unlinkCharacter; the raw endpoint would skip its runners and email
    // repair. Only HTTP requests are refused, so the server-side auth.api.unlinkAccount still works.
    disabledPaths: ['/unlink-account'],
    databaseHooks: {
      account: {
        create: {
          before: async (acct) => ({
            data: encryptAccountTokens(withOwnerHashFromToken(acct), encryptToken),
          }),
          after: async (acct) => {
            if (acct.providerId !== EVE_PROVIDER_ID) return;
            const characterId = parseLinkedAccountId(acct.accountId);
            if (characterId === null) return;
            await runners.runAfterCharacterLinkChanged({ userId: acct.userId, characterId });
          },
        },
        update: { before: async (acct) => ({ data: encryptAccountTokens(acct, encryptToken) }) },
      },
    },
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
        authorizationSuspended: { type: 'boolean', required: false, defaultValue: false, input: false, returned: false },
        authorizationVerifiedAt: { type: 'date', required: false, input: false, returned: false },
        authorizationNextCheckAt: { type: 'date', required: false, input: false, returned: false },
        authorizationFailureFirstAt: { type: 'date', required: false, input: false, returned: false },
        authorizationFailureCount: { type: 'number', required: false, defaultValue: 0, input: false, returned: false },
        authorizationAccessChangedAt: { type: 'date', required: false, input: false, returned: false },
        ownerHash: { type: 'string', required: false, input: false, returned: false },
        deletionRequestedAt: { type: 'date', required: false, input: false, returned: false },
      },
      // Implicit linking would match a signing-in character to whichever user's email still names it.
      accountLinking: { allowDifferentEmails: true, disableImplicitLinking: true },
    },
    user: {
      additionalFields: {
        role: { type: 'string', required: false, defaultValue: 'USER', input: false },
        activeCharacterId: { type: 'number', bigint: true, required: false, input: false },
        deletionRequestedAt: { type: 'date', required: false, input: false, returned: false },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      freshAge: 0,
      cookieCache: {
        enabled: process.env.NODE_ENV === 'production',
        maxAge: 300,
      },
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
            prompt: 'consent',
            overrideUserInfo: true,
            getToken: async ({ code, codeVerifier }) => {
              const token = await exchangeCodeForToken({
                code,
                codeVerifier: codeVerifier ?? '',
              });
              return {
                accessToken: token.access_token,
                refreshToken: token.refresh_token,
                accessTokenExpiresAt: token.expires_in
                  ? new Date(Date.now() + token.expires_in * 1000)
                  : undefined,
                scopes: [...EVE_SCOPES],
                raw: token as unknown as Record<string, unknown>,
              };
            },
            getUserInfo: async (tokens) => {
              if (!tokens.accessToken) return null;
              const claims = await verifyEveJwt(tokens.accessToken);
              const character = claimsToCharacter(claims);
              const outcome = await proveCharacter({
                characterId: character.characterId,
                ownerHash: claims.owner ?? null,
                linkingUserId: await readLinkingUserId(),
              });
              if (outcome.kind === 'merged') {
                await rebindLinkTarget(outcome.survivorUserId);
                recordMerge();
              }
              // A user whose stale email names this character would refuse the sign-in, or make
              // overrideUserInfo collide. If this repair fails, Better Auth still refuses: never a takeover.
              await releaseSyntheticEmail(character.characterId).catch((error: unknown) => {
                console.error('[auth] stale synthetic email repair failed', error);
              });
              await upsertCharacterLoginIdentity(character);
              after(() => refreshCharacterAffiliations([character.characterId]));
              emitUsageEvent('auth', {
                action: 'auth_login',
                characterId: character.characterId,
                metadata: {},
              });
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
      jwt({
        jwks: { keyPairConfig: { alg: 'ES256' } },
        jwt: {
          issuer: readEnv('BETTER_AUTH_URL'),
          audience: 'convex',
          expirationTime: '7d',
          definePayload: ({ user: u }) => ({
            role: normalizeCharacterRole(u.role),
            name: u.name,
          }),
        },
        adapter: { getJwks: getCachedJwks },
        disableSettingJwtHeader: true,
      }),
    ],
  } satisfies BetterAuthOptions;

  return betterAuth({
    ...options,
    plugins: [
      ...options.plugins,
      customSession(async ({ user: u, session: s }) => {
        const active = await resolveActiveCharacter(u.id, u.activeCharacterId ?? null);
        return deriveSessionIdentity({ user: u, session: s, active, isAdmin: isAdminIdentity });
      }, options),
    ],
  });
}

export type AppAuth = ReturnType<typeof createAuth>;
