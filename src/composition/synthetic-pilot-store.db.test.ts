import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  createDbTestHarness,
  seedEveAccount,
  seedUser,
} from '@/db/__tests__/support/db-test-harness';
import { account, characters, user } from '@/db/auth-schema';
import { SYNTHETIC_PILOT } from '@/platform/auth/synthetic-pilot';
import { syntheticEmail } from '@/platform/auth/synthetic-email';

const harness = await createDbTestHarness({
  schema: 'test_synthetic_pilot_store',
  tables: ['user', 'account', 'session', 'characters'],
  foreignKeys: [
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
  });
});
