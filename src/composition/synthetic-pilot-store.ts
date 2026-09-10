import 'server-only';

import { auth } from '@/composition/auth';
import { db } from '@/db';
import { account, user } from '@/db/auth-schema';
import { characterPortraitUrl } from '@/lib/eve-image';
import { EVE_PROVIDER_ID } from '@/lib/eve-provider';
import { upsertCharacterLoginIdentity } from '@/platform/auth/linked-characters';
import { signSessionToken } from '@/platform/auth/sign-session-token';
import { syntheticEmail } from '@/platform/auth/synthetic-email';
import { SYNTHETIC_PILOT } from '@/platform/auth/synthetic-pilot';

export type SyntheticPilotSessionCookie = {
  readonly name: string;
  readonly value: string;
  readonly domain: 'localhost';
  readonly path: string;
  readonly httpOnly: boolean;
  readonly secure: boolean;
  readonly sameSite: 'Lax' | 'Strict' | 'None';
  readonly maxAgeSec: number;
};

const ACCOUNT_ROW_ID = `e2e-eve-${SYNTHETIC_PILOT.characterId}`;
const DEFAULT_SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7;

export async function becomeSyntheticPilot(): Promise<{
  cookies: readonly SyntheticPilotSessionCookie[];
}> {
  await upsertSyntheticPilotRows();
  return { cookies: [await issueSyntheticPilotSessionCookie()] };
}

async function upsertSyntheticPilotRows(): Promise<void> {
  const now = new Date();
  const portraitUrl = characterPortraitUrl(SYNTHETIC_PILOT.characterId, 128);
  const email = syntheticEmail(SYNTHETIC_PILOT.characterId);
  const userWrite = {
    name: SYNTHETIC_PILOT.name,
    email,
    emailVerified: true,
    image: portraitUrl,
    role: SYNTHETIC_PILOT.role,
    activeCharacterId: SYNTHETIC_PILOT.characterId,
    updatedAt: now,
  };

  await db
    .insert(user)
    .values({
      id: SYNTHETIC_PILOT.userId,
      createdAt: now,
      ...userWrite,
    })
    .onConflictDoUpdate({
      target: user.id,
      set: userWrite,
    });

  await upsertCharacterLoginIdentity({
    characterId: SYNTHETIC_PILOT.characterId,
    name: SYNTHETIC_PILOT.name,
    portraitUrl,
  });

  await db
    .insert(account)
    .values({
      id: ACCOUNT_ROW_ID,
      accountId: String(SYNTHETIC_PILOT.characterId),
      providerId: EVE_PROVIDER_ID,
      userId: SYNTHETIC_PILOT.userId,
      accessToken: null,
      refreshToken: null,
      idToken: null,
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
      scope: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [account.providerId, account.accountId],
      set: {
        userId: SYNTHETIC_PILOT.userId,
        accessToken: null,
        refreshToken: null,
        idToken: null,
        accessTokenExpiresAt: null,
        refreshTokenExpiresAt: null,
        scope: null,
        updatedAt: now,
      },
    });
}

async function issueSyntheticPilotSessionCookie(): Promise<SyntheticPilotSessionCookie> {
  const ctx = await auth.$context;
  const secret = ctx.secret;
  if (typeof secret !== 'string' || secret.length === 0) {
    throw new Error(
      'BETTER_AUTH_SECRET or SESSION_SECRET is required to mint the synthetic pilot session',
    );
  }

  const created = await ctx.internalAdapter.createSession(SYNTHETIC_PILOT.userId);
  const token = created.token;
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('Better Auth createSession returned no session token');
  }

  const attributes = ctx.authCookies.sessionToken.attributes;
  const maxAgeSec =
    typeof attributes.maxAge === 'number' && attributes.maxAge > 0
      ? attributes.maxAge
      : DEFAULT_SESSION_MAX_AGE_SEC;

  return {
    name: ctx.authCookies.sessionToken.name,
    value: await signSessionToken(token, secret),
    domain: 'localhost',
    path: attributes.path ?? '/',
    httpOnly: attributes.httpOnly ?? true,
    secure: attributes.secure ?? false,
    sameSite: cookieSameSite(attributes.sameSite),
    maxAgeSec,
  };
}

function cookieSameSite(value: unknown): SyntheticPilotSessionCookie['sameSite'] {
  if (value === 'strict' || value === 'Strict') return 'Strict';
  if (value === 'none' || value === 'None') return 'None';
  return 'Lax';
}
