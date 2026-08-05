/**
 * Test-only Better Auth instance + seed helpers for Playwright.
 * Never import from production route handlers — `testUtils` exposes privileged
 * session/user helpers that must not ship in the Vercel runtime path.
 */
import { config } from 'dotenv';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { testUtils } from 'better-auth/plugins';
import { eq } from 'drizzle-orm';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { account, characters, jwks, session, user, verification } from '@/db/auth-schema';
import { db } from '@/db';
import { readEnv } from '@/lib/env';
import { syntheticEmail } from '@/platform/auth/synthetic-email';
import {
  DEFAULT_STORAGE_STATE_PATH as DEFAULT_STORAGE_STATE_RELATIVE,
  E2E_CHARACTER_ID,
  E2E_CHARACTER_NAME,
  E2E_USER_ID,
} from './identity';

export { E2E_CHARACTER_ID, E2E_CHARACTER_NAME, E2E_USER_ID } from './identity';

config({ path: process.env.DOTENV_PATH ?? '.env.local' });

/** Absolute default path for writing seed output (`pnpm e2e:seed`). */
export const DEFAULT_STORAGE_STATE_PATH = path.resolve(
  process.cwd(),
  DEFAULT_STORAGE_STATE_RELATIVE,
);

const baseURL = readEnv('BETTER_AUTH_URL') ?? 'http://localhost:3000';

/**
 * Minimal Better Auth mirror of production secret/DB/cookie settings with only
 * `testUtils()`. Cookie signing must match the Next app under test.
 */
export const e2eAuth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: { user, session, account, verification, jwks },
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
    expiresIn: 60 * 60 * 24 * 7,
    freshAge: 0,
    cookieCache: { enabled: true, maxAge: 300 },
  },
  plugins: [testUtils()],
});

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

/**
 * Upserts the durable E2E pilot (user + EVE account + character profile) and
 * writes a Playwright `storageState` JSON with a correctly signed session cookie.
 */
export async function seedE2eStorageState(
  outPath: string = DEFAULT_STORAGE_STATE_PATH,
  cookieDomain = 'localhost',
): Promise<string> {
  const secret = readEnv('BETTER_AUTH_SECRET') ?? readEnv('SESSION_SECRET');
  if (!secret) {
    throw new Error(
      'BETTER_AUTH_SECRET or SESSION_SECRET is required to seed E2E auth cookies',
    );
  }

  const ctx = await e2eAuth.$context;
  const helpers = ctx.test;
  if (!helpers) {
    throw new Error('e2eAuth is missing testUtils helpers (ctx.test)');
  }

  await helpers.deleteUser(E2E_USER_ID).catch(() => {
    // First run — no prior e2e user.
  });

  const created = helpers.createUser({
    id: E2E_USER_ID,
    name: E2E_CHARACTER_NAME,
    email: syntheticEmail(E2E_CHARACTER_ID),
    emailVerified: true,
    image: `https://images.evetech.net/characters/${E2E_CHARACTER_ID}/portrait?size=128`,
  });
  await helpers.saveUser(created);

  const now = new Date();
  await db
    .insert(characters)
    .values({
      characterId: E2E_CHARACTER_ID,
      name: E2E_CHARACTER_NAME,
      portraitUrl: `https://images.evetech.net/characters/${E2E_CHARACTER_ID}/portrait?size=128`,
      role: 'USER',
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    })
    .onConflictDoUpdate({
      target: characters.characterId,
      set: {
        name: E2E_CHARACTER_NAME,
        portraitUrl: `https://images.evetech.net/characters/${E2E_CHARACTER_ID}/portrait?size=128`,
        updatedAt: now,
        lastLoginAt: now,
      },
    });

  await db
    .insert(account)
    .values({
      id: `e2e-eve-${E2E_CHARACTER_ID}`,
      accountId: String(E2E_CHARACTER_ID),
      providerId: 'eve',
      userId: E2E_USER_ID,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();

  await db
    .update(user)
    .set({ activeCharacterId: E2E_CHARACTER_ID, name: E2E_CHARACTER_NAME, updatedAt: now })
    .where(eq(user.id, E2E_USER_ID));

  const cookies = await helpers.getCookies({
    userId: E2E_USER_ID,
    domain: cookieDomain,
  });

  const storageState: PlaywrightStorageState = {
    cookies: cookies.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      expires: cookie.expires ?? Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
      httpOnly: cookie.httpOnly ?? true,
      secure: cookie.secure ?? false,
      sameSite: cookie.sameSite ?? 'Lax',
    })),
    origins: [],
  };

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(storageState, null, 2)}\n`);
  return outPath;
}
