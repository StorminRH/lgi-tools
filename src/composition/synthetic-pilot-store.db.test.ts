import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import {
  createDbTestHarness,
  seedEveAccount,
  seedUser,
} from '@/db/__tests__/support/db-test-harness';
import { account, characters, session as sessions, user } from '@/db/auth-schema';
import { maps, mapAccess } from '@/data/maps/schema';
import { SYNTHETIC_PILOT } from '@/platform/auth/synthetic-pilot';
import { syntheticEmail } from '@/platform/auth/synthetic-email';

const harness = await createDbTestHarness({
  schema: 'test_synthetic_pilot_store',
  tables: ['user', 'account', 'session', 'characters', 'maps', 'map_access'],
  foreignKeys: [
    { table: 'maps', column: 'user_id', refTable: 'user', refColumn: 'id', onDelete: 'cascade' },
    { table: 'map_access', column: 'map_id', refTable: 'maps', refColumn: 'id', onDelete: 'cascade' },
    {
      table: 'account',
      column: 'user_id',
      refTable: 'user',
      refColumn: 'id',
      onDelete: 'cascade',
    },
    {
      table: 'session',
      column: 'user_id',
      refTable: 'user',
      refColumn: 'id',
      onDelete: 'cascade',
    },
  ],
  steerDbProxy: true,
  env: {
    BETTER_AUTH_SECRET: 'synthetic-pilot-db-test-secret-32ch',
    BETTER_AUTH_URL: 'http://localhost:3000',
    NEXT_PUBLIC_CONVEX_URL: '',
    CONVEX_SERVICE_SECRET: '',
  },
  resetBetweenTests: 'delete',
});

describe.skipIf(!harness.reachable)('becomeSyntheticPilot (real Postgres)', () => {
  it('converges dirty rows to the reserved disconnected pilot and issues a session cookie Better Auth accepts', async () => {
    await seedUser(harness.db, SYNTHETIC_PILOT.userId, {
      name: 'Dirty Pilot',
      email: 'dirty-pilot@example.test',
      role: 'ADMIN',
      activeCharacterId: 42,
    });
    await seedEveAccount(
      harness.db,
      {
        id: `e2e-eve-${SYNTHETIC_PILOT.characterId}`,
        characterId: SYNTHETIC_PILOT.characterId,
        userId: SYNTHETIC_PILOT.userId,
      },
      {
        accessToken: 'dirty-access',
        refreshToken: 'dirty-refresh',
        scope: 'esi-skills.read_skills.v1',
      },
    );

    await seedUser(harness.db, 'unrelated-user');
    const ownedMap = '50300000-0000-4000-8000-000000000001';
    const otherMap = '50300000-0000-4000-8000-000000000002';
    await harness.db.insert(maps).values([
      { id: ownedMap, userId: SYNTHETIC_PILOT.userId, name: 'Old fixture' },
      { id: otherMap, userId: 'unrelated-user', name: 'Keep me' },
    ]);
    await harness.db.insert(mapAccess).values([
      { mapId: otherMap, ownerType: 'character', ownerId: 9000001, role: 'admin' },
      { mapId: otherMap, ownerType: 'character', ownerId: 42, role: 'viewer' },
    ]);
    await seedEveAccount(harness.db, {
      id: 'extra-linked', characterId: 42, userId: SYNTHETIC_PILOT.userId,
    });
    await harness.db.insert(characters).values({
      characterId: 9000001, name: 'Dirty Pilot', portraitUrl: '',
      corporationId: 123, allianceId: 456, factionId: 789,
    });
    const { becomeSyntheticPilot } = await import('./synthetic-pilot-store');
    const { auth } = await import('./auth');

    const first = await becomeSyntheticPilot();
    const [cookie] = first.cookies;
    if (cookie === undefined) throw new Error('becomeSyntheticPilot returned no cookies');

    const [userRow] = await harness.db
      .select()
      .from(user)
      .where(eq(user.id, SYNTHETIC_PILOT.userId));
    expect(userRow).toMatchObject({
      id: SYNTHETIC_PILOT.userId,
      name: SYNTHETIC_PILOT.name,
      email: syntheticEmail(SYNTHETIC_PILOT.characterId),
      role: 'USER',
      activeCharacterId: SYNTHETIC_PILOT.characterId,
    });

    const [characterRow] = await harness.db
      .select()
      .from(characters)
      .where(eq(characters.characterId, SYNTHETIC_PILOT.characterId));
    expect(characterRow).toMatchObject({
      characterId: SYNTHETIC_PILOT.characterId,
      name: SYNTHETIC_PILOT.name,
    });
    expect(characterRow?.portraitUrl).toContain(`/characters/${SYNTHETIC_PILOT.characterId}/portrait`);

    const [accountRow] = await harness.db
      .select()
      .from(account)
      .where(eq(account.userId, SYNTHETIC_PILOT.userId));
    expect(accountRow).toMatchObject({
      accountId: String(SYNTHETIC_PILOT.characterId),
      providerId: 'eve',
      userId: SYNTHETIC_PILOT.userId,
      accessToken: null,
      refreshToken: null,
      scope: null,
    });

    expect(await harness.db.select({ id: maps.id }).from(maps)).toEqual([{ id: otherMap }]);
    expect(await harness.db.select({ ownerId: mapAccess.ownerId }).from(mapAccess)).toEqual([{ ownerId: 42 }]);
    expect(await harness.db.select({ id: account.accountId }).from(account)).toEqual([{ id: '9000001' }]);
    expect(characterRow).toMatchObject({ corporationId: null, allianceId: null, factionId: null });
    expect(cookie.domain).toBe('localhost');
    expect(cookie.value).toContain('.');

    const session = await auth.api.getSession({
      headers: new Headers({ cookie: `${cookie.name}=${cookie.value}` }),
    });
    expect(session?.user.id).toBe(SYNTHETIC_PILOT.userId);
    expect(session?.characterId).toBe(SYNTHETIC_PILOT.characterId);
    expect(session?.name).toBe(SYNTHETIC_PILOT.name);
    expect(session?.role).toBe('USER');

    const second = await becomeSyntheticPilot();
    const [secondCookie] = second.cookies;
    if (secondCookie === undefined) throw new Error('second mint returned no cookies');

    const [accountAfter] = await harness.db
      .select()
      .from(account)
      .where(eq(account.userId, SYNTHETIC_PILOT.userId));
    expect(accountAfter?.accessToken).toBeNull();
    expect(accountAfter?.refreshToken).toBeNull();
    expect(accountAfter?.scope).toBeNull();

    const sessionAfter = await auth.api.getSession({
      headers: new Headers({ cookie: `${secondCookie.name}=${secondCookie.value}` }),
    });
    expect(sessionAfter?.user.id).toBe(SYNTHETIC_PILOT.userId);
    expect(await auth.api.getSession({
      headers: new Headers({ cookie: `${cookie.name}=${cookie.value}` }),
    })).toBeNull();
    expect(await harness.db.select({ userId: sessions.userId }).from(sessions)).toEqual([{ userId: 'e2e-pilot' }]);
  });
});

describe.skipIf(!harness.reachable)('synthetic pilot reset boundary', () => {
  it.each([
    ['NODE_ENV', 'production'],
    ['VERCEL_ENV', 'preview'],
    ['LOCAL_DB_DRIVER', ''],
    ['LGI_DATABASE_URL', 'production.example'],
    ['BETTER_AUTH_URL', 'https://lgi.tools'],
    ['NEXT_PUBLIC_CONVEX_URL', 'https://example.convex.cloud'],
    ['BETTER_AUTH_SECRET', ''],
    ['SUPERADMIN_CHARACTER_ID', '9000001'],
  ])('refuses %s=%s before changing the fixture', async (name, value) => {
    await seedUser(harness.db, 'e2e-pilot', { name: 'Preserve on denial' });
    const previous = process.env[name];
    const deniedValue = name === 'LGI_DATABASE_URL'
      ? new URL(process.env.DATABASE_URL ?? '')
      : null;
    if (deniedValue) deniedValue.hostname = value;
    vi.stubEnv(name, deniedValue?.href ?? value);
    try {
      const { becomeSyntheticPilot } = await import('./synthetic-pilot-store');
      await expect(becomeSyntheticPilot()).rejects.toThrow();
      expect(await harness.db.select({ name: user.name }).from(user)).toEqual([
        { name: 'Preserve on denial' },
      ]);
      expect(await harness.db.select().from(sessions)).toHaveLength(0);
    } finally {
      vi.stubEnv(name, previous);
    }
  });

  it('does not take the reserved character from another user', async () => {
    await seedUser(harness.db, 'different-owner');
    await seedEveAccount(harness.db, {
      id: 'foreign-account', characterId: 9000001, userId: 'different-owner',
    });
    const { becomeSyntheticPilot } = await import('./synthetic-pilot-store');
    await expect(becomeSyntheticPilot()).rejects.toThrow('belongs to another user');
    expect(await harness.db.select({ userId: account.userId }).from(account)).toEqual([
      { userId: 'different-owner' },
    ]);
  });
});
