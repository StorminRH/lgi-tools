import 'server-only';

import { and, eq, ne } from 'drizzle-orm';
import { auth } from '@/composition/auth';
import { purgeMapChain } from '@/composition/map-purge';
import {
  purgeUserMapAccessProjection,
  teardownMapAccessProjection,
} from '@/composition/map-access-projection';
import { purgeLocationTracking } from '@/data/location-tracking/purge';
import { mapAccess, maps } from '@/data/maps/schema';
import { db } from '@/db';
import { account, characters, user } from '@/db/auth-schema';
import { readEnv, isHostedVercel } from '@/lib/env';
import { characterPortraitUrl } from '@/lib/eve-image';
import { EVE_PROVIDER_ID } from '@/lib/eve-provider';
import { revokeUserSessions } from '@/platform/auth/admin-users';
import { createLocalSession } from '@/platform/auth/local-session';
import { syntheticEmail } from '@/platform/auth/synthetic-email';
import { SYNTHETIC_PILOT } from '@/platform/auth/synthetic-pilot';

function isLocalUrl(
  value: string | undefined,
  protocols: readonly string[],
  hosts: readonly string[] = ['localhost', '127.0.0.1', '[::1]'],
): boolean {
  try {
    const url = new URL(value ?? '');
    return protocols.includes(url.protocol) && hosts.includes(url.hostname);
  } catch {
    return false;
  }
}

function assertLocalSyntheticEnvironment(): string {
  const databaseUrl = readEnv('DATABASE_URL');
  const ciDatabase =
    readEnv('CI') === 'true' &&
    isLocalUrl(databaseUrl, ['postgres:', 'postgresql:'], ['postgres']);
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (
    process.env.NODE_ENV === 'production' ||
    isHostedVercel() ||
    readEnv('LOCAL_DB_DRIVER') !== 'postgres-js' ||
    (!isLocalUrl(databaseUrl, ['postgres:', 'postgresql:']) && !ciDatabase) ||
    !isLocalUrl(readEnv('BETTER_AUTH_URL'), ['http:'], ['localhost']) ||
    (convexUrl && !isLocalUrl(convexUrl, ['http:']))
  ) {
    throw new Error(
      'Synthetic pilot reset requires a local development or test database and auth server',
    );
  }
  const secret = readEnv('BETTER_AUTH_SECRET') ?? readEnv('SESSION_SECRET');
  if (!secret) {
    throw new Error(
      'BETTER_AUTH_SECRET or SESSION_SECRET is required to mint the synthetic pilot session',
    );
  }
  if (Number(readEnv('SUPERADMIN_CHARACTER_ID')) === SYNTHETIC_PILOT.characterId) {
    throw new Error('The synthetic pilot cannot be the configured superadmin');
  }
  return secret;
}

export async function becomeSyntheticPilot(requestHeaders?: Headers) {
  const secret = assertLocalSyntheticEnvironment();
  const ctx = await auth.$context;
  if (ctx.secret !== secret) {
    throw new Error('Load auth environment before importing the synthetic pilot store');
  }
  const [foreignOwner] = await db
    .select({ id: account.id })
    .from(account)
    .where(
      and(
        eq(account.providerId, EVE_PROVIDER_ID),
        eq(account.accountId, String(SYNTHETIC_PILOT.characterId)),
        ne(account.userId, SYNTHETIC_PILOT.userId),
      ),
    );
  if (foreignOwner) {
    throw new Error('The synthetic character belongs to another user');
  }

  await revokeUserSessions(SYNTHETIC_PILOT.userId);
  if (process.env.NEXT_PUBLIC_CONVEX_URL) {
    const ownedMaps = await db
      .select({ id: maps.id })
      .from(maps)
      .where(eq(maps.userId, SYNTHETIC_PILOT.userId));
    for (const map of ownedMaps) {
      await purgeMapChain(map.id);
      await teardownMapAccessProjection(map.id);
    }
    await purgeUserMapAccessProjection(SYNTHETIC_PILOT.userId);
    await purgeLocationTracking(SYNTHETIC_PILOT.userId, null);
  }
  await db
    .delete(mapAccess)
    .where(
      and(
        eq(mapAccess.ownerType, 'character'),
        eq(mapAccess.ownerId, SYNTHETIC_PILOT.characterId),
      ),
    );
  await db.delete(user).where(eq(user.id, SYNTHETIC_PILOT.userId));
  await createSyntheticPilotRows();
  return createLocalSession(ctx, SYNTHETIC_PILOT.userId, requestHeaders);
}

async function createSyntheticPilotRows(): Promise<void> {
  const now = new Date();
  const portraitUrl = characterPortraitUrl(SYNTHETIC_PILOT.characterId, 128);
  await db.insert(user).values({
    id: SYNTHETIC_PILOT.userId,
    name: SYNTHETIC_PILOT.name,
    email: syntheticEmail(SYNTHETIC_PILOT.characterId),
    emailVerified: true,
    image: portraitUrl,
    role: SYNTHETIC_PILOT.role,
    activeCharacterId: SYNTHETIC_PILOT.characterId,
  });
  const identity = {
    name: SYNTHETIC_PILOT.name,
    portraitUrl,
    corporationId: null,
    allianceId: null,
    factionId: null,
    affiliationRefreshedAt: null,
    updatedAt: now,
    lastLoginAt: now,
  };
  await db
    .insert(characters)
    .values({
      characterId: SYNTHETIC_PILOT.characterId,
      ...identity,
    })
    .onConflictDoUpdate({ target: characters.characterId, set: identity });
  await db.insert(account).values({
    id: `e2e-eve-${SYNTHETIC_PILOT.characterId}`,
    accountId: String(SYNTHETIC_PILOT.characterId),
    providerId: EVE_PROVIDER_ID,
    userId: SYNTHETIC_PILOT.userId,
    createdAt: now,
    updatedAt: now,
  });
}
