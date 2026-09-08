import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { testUtils } from 'better-auth/plugins';
import { eq } from 'drizzle-orm';
import { account, characters, jwks, session, user, verification } from '@/db/auth-schema';
import { db } from '@/db';
import { readEnv } from '@/lib/env';
import { syntheticEmail } from '@/platform/auth/synthetic-email';
import { requireLocalAuthEnvironment } from './fixture-data-local.cjs';
import type { FixtureIdentity } from './identity';

export type PlaywrightStorageState = {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'Strict' | 'Lax' | 'None';
  }>;
  origins: [];
};

export async function seedFixturePrincipal(
  identity: FixtureIdentity,
  baseURL: string,
  ownership: { userCreated: () => void; characterCreated: () => void },
) {
  const app = requireLocalAuthEnvironment(baseURL);
  const auth = betterAuth({
    database: drizzleAdapter(db, {
      provider: 'pg', schema: { user, session, account, verification, jwks },
    }),
    secret: readEnv('BETTER_AUTH_SECRET') ?? readEnv('SESSION_SECRET'),
    baseURL,
    user: {
      additionalFields: {
        role: { type: 'string', required: false, defaultValue: 'USER', input: false },
        activeCharacterId: { type: 'number', bigint: true, required: false, input: false },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24, freshAge: 0,
      cookieCache: { enabled: true, maxAge: 300 },
    },
    plugins: [testUtils()],
  });
  const helpers = (await auth.$context).test;
  if (!helpers) throw new Error('E2E_PREREQUISITE: Better Auth test helpers unavailable');
  await helpers.saveUser(helpers.createUser({
    id: identity.userId, name: identity.name,
    email: syntheticEmail(identity.characterId), emailVerified: true,
    image: '/logo.png',
  }));
  ownership.userCreated();
  const now = new Date();
  await db.insert(characters).values({
    characterId: identity.characterId, name: identity.name, portraitUrl: '/logo.png',
    affiliationRefreshedAt: now, createdAt: now, updatedAt: now, lastLoginAt: now,
  });
  ownership.characterCreated();
  await db.insert(account).values({
    id: `e2e-eve-${identity.userId}`, accountId: String(identity.characterId),
    providerId: 'eve', userId: identity.userId, createdAt: now, updatedAt: now,
  });
  await db.update(user).set({ activeCharacterId: identity.characterId }).where(eq(user.id, identity.userId));
  const cookies = await helpers.getCookies({ userId: identity.userId, domain: app.hostname });
  const storageState: PlaywrightStorageState = {
    cookies: cookies.map((cookie) => ({
      name: cookie.name, value: cookie.value, domain: cookie.domain, path: cookie.path,
      expires: cookie.expires ?? Math.floor(Date.now() / 1000) + 86_400,
      httpOnly: cookie.httpOnly ?? true, secure: cookie.secure ?? app.protocol === 'https:',
      sameSite: cookie.sameSite ?? 'Lax',
    })),
    origins: [],
  };
  return { ...identity, storageState };
}
