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
import { assertLocalDatabaseUrl, isLocalUrl } from '@/lib/url-safety';
import { characterPortraitUrl } from '@/lib/eve-image';
import { EVE_PROVIDER_ID } from '@/lib/eve-provider';
import { revokeUserSessions } from '@/platform/auth/admin-users';
import { createLocalSession, type LocalSession } from '@/platform/auth/local-session';
import { syntheticEmail } from '@/platform/auth/synthetic-email';
import { SYNTHETIC_PILOT, type SyntheticPilot } from '@/platform/auth/synthetic-pilot';

function assertLocalSyntheticEnvironment(pilot: SyntheticPilot): string {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Synthetic pilot reset is disabled in production');
  }
  if (isHostedVercel()) {
    throw new Error('Synthetic pilot reset is disabled on hosted Vercel');
  }
  if (readEnv('LOCAL_DB_DRIVER') !== 'postgres-js') {
    throw new Error('Synthetic pilot reset requires LOCAL_DB_DRIVER=postgres-js');
  }
  const databaseUrl = readEnv('DATABASE_URL');
  const ciDatabase =
    readEnv('CI') === 'true' &&
    isLocalUrl(databaseUrl, ['postgres:', 'postgresql:'], ['postgres']);
  if (!ciDatabase) assertLocalDatabaseUrl(databaseUrl, 'Synthetic pilot reset');
  if (!isLocalUrl(readEnv('BETTER_AUTH_URL'), ['http:'], ['localhost'])) {
    throw new Error('Synthetic pilot reset requires BETTER_AUTH_URL on http://localhost');
  }
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (convexUrl && !isLocalUrl(convexUrl, ['http:'])) {
    throw new Error('Synthetic pilot reset requires a local HTTP NEXT_PUBLIC_CONVEX_URL');
  }
  const secret = readEnv('BETTER_AUTH_SECRET') ?? readEnv('SESSION_SECRET');
  if (!secret) {
    throw new Error(
      'BETTER_AUTH_SECRET or SESSION_SECRET is required to mint the synthetic pilot session',
    );
  }
  if (Number(readEnv('SUPERADMIN_CHARACTER_ID')) === pilot.characterId) {
    throw new Error('The synthetic pilot cannot be the configured superadmin');
  }
  return secret;
}

export async function becomeSyntheticPilot(
  requestHeaders?: Headers,
  pilot: SyntheticPilot = SYNTHETIC_PILOT,
): Promise<LocalSession> {
  const secret = assertLocalSyntheticEnvironment(pilot);
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
        eq(account.accountId, String(pilot.characterId)),
        ne(account.userId, pilot.userId),
      ),
    );
  if (foreignOwner) {
    throw new Error('The synthetic character belongs to another user');
  }

  // Reset must atomically replace the fixture below and also work without Convex.
  // nukeAccount commits deletion first and requires owned-map Convex teardown,
  // so it cannot preserve either reset guarantee.
  await revokeUserSessions(pilot.userId);
  if (process.env.NEXT_PUBLIC_CONVEX_URL) {
    const ownedMaps = await db
      .select({ id: maps.id })
      .from(maps)
      .where(eq(maps.userId, pilot.userId));
    for (const map of ownedMaps) {
      await purgeMapChain(map.id);
      await teardownMapAccessProjection(map.id);
    }
    await purgeUserMapAccessProjection(pilot.userId);
    await purgeLocationTracking(pilot.userId, null);
  }
  await db.transaction(async (tx) => {
    await tx
      .delete(mapAccess)
      .where(
        and(
          eq(mapAccess.ownerType, 'character'),
          eq(mapAccess.ownerId, pilot.characterId),
        ),
      );
    await tx.delete(user).where(eq(user.id, pilot.userId));
    await createSyntheticPilotRows(tx, pilot);
  });
  return createLocalSession(ctx, pilot.userId, requestHeaders);
}

async function createSyntheticPilotRows(tx: Pick<typeof db, 'insert'>, pilot: SyntheticPilot): Promise<void> {
  const now = new Date();
  const portraitUrl = characterPortraitUrl(pilot.characterId, 128);
  await tx.insert(user).values({
    id: pilot.userId,
    name: pilot.name,
    email: syntheticEmail(pilot.characterId),
    emailVerified: true,
    image: portraitUrl,
    role: pilot.role,
    activeCharacterId: pilot.characterId,
  });
  const identity = {
    name: pilot.name,
    portraitUrl,
    corporationId: null,
    allianceId: null,
    factionId: null,
    affiliationRefreshedAt: null,
    updatedAt: now,
    lastLoginAt: now,
  };
  await tx
    .insert(characters)
    .values({
      characterId: pilot.characterId,
      ...identity,
    })
    .onConflictDoUpdate({ target: characters.characterId, set: identity });
  await tx.insert(account).values({
    id: `e2e-eve-${pilot.characterId}`,
    accountId: String(pilot.characterId),
    providerId: EVE_PROVIDER_ID,
    userId: pilot.userId,
    createdAt: now,
    updatedAt: now,
  });
}
