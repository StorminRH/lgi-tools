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
import type { IdentityProjectionRunners } from './identity-projection-runners';
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

interface CreateAuthDeps {
  readonly runners: IdentityProjectionRunners;
  readonly reconcileCharacterOwner: (
    characterId: number,
    jwtOwnerHash: string | null | undefined,
  ) => Promise<void>;
}

export function createAuth({ runners, reconcileCharacterOwner }: CreateAuthDeps) {
  const options = {
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: { user, session, account, verification, jwks },
    }),
    secret: readEnv('BETTER_AUTH_SECRET') ?? readEnv('SESSION_SECRET'),
    baseURL: readEnv('BETTER_AUTH_URL'),
    databaseHooks: {
      account: {
        create: {
          before: async (acct) => ({ data: encryptAccountTokens(acct, encryptToken) }),
          after: async (acct) => {
            if (acct.providerId !== EVE_PROVIDER_ID) return;
            const characterId = Number(acct.accountId);
            if (!Number.isFinite(characterId)) return;
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
      },
      accountLinking: { allowDifferentEmails: true },
    },
    user: {
      additionalFields: {
        role: { type: 'string', required: false, defaultValue: 'USER', input: false },
        activeCharacterId: { type: 'number', bigint: true, required: false, input: false },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      freshAge: 0,
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
            prompt: 'consent',
            overrideUserInfo: true,
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
                scopes: [...EVE_SCOPES],
                raw: token as unknown as Record<string, unknown>,
              };
            },
            getUserInfo: async (tokens) => {
              if (!tokens.accessToken) return null;
              const claims = await verifyEveJwt(tokens.accessToken);
              const character = claimsToCharacter(claims);
              await reconcileCharacterOwner(character.characterId, claims.owner);
              const { absorbed } = await absorbLinkedCharacterOnProof(
                character.characterId,
                runners,
              );
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
      jwt({
        jwks: { keyPairConfig: { alg: 'ES256' } },
        jwt: {
          issuer: readEnv('BETTER_AUTH_URL'),
          audience: 'convex',
          expirationTime: '7d',
          definePayload: ({ user: u }) => ({
            role: (u.role as CharacterRole | undefined) ?? 'USER',
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
        return deriveSessionIdentity({ user: u, session: s, active, isAdmin: computeIsAdmin });
      }, options),
    ],
  });
}

export type AppAuth = ReturnType<typeof createAuth>;
