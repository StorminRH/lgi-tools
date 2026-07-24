import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createDbTestHarness,
  seedEveAccount as insertEveAccount,
  seedUser as insertUser,
} from '@/db/test-support/db-test-harness';
import { getStoredActiveCharacterId } from './linked-characters';
import {
  CHARACTER_SEARCH_LIMIT,
  deleteLinkedCharacter,
  getActiveSessionCount,
  getUserByCharacterId,
  getUserById,
  listAdminUsers,
  reassignCharacter,
  revokeUserSessions,
  searchUsersByLinkedCharacterName,
  setUserRole,
} from './admin-users';
import { account, session, user } from '@/db/auth-schema';

const harness = await createDbTestHarness({
  schema: 'test_auth_admin_users',
  tables: ['user', 'account', 'session'],
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
  resetBetweenTests: 'delete',
});

const SOURCE_ID = 'source-user';
const TARGET_ID = 'target-user';
const MOVED_CHAR = 90000021;
const SURVIVOR_CHAR = 90000022;

describe.skipIf(!harness.reachable)('admin-user queries (real Postgres)', () => {
  beforeEach(async () => {
    await seedUser(SOURCE_ID, { name: 'Source Pilot' });
    await seedUser(TARGET_ID, { name: 'Target Pilot' });
  });

  async function seedUser(
    id: string,
    overrides: Partial<typeof user.$inferInsert> = {},
  ) {
    await insertUser(harness.db, id, {
      name: `Pilot ${id}`,
      email: `${id}@eve.invalid`,
      ...overrides,
    });
  }

  async function seedEveAccount(
    id: string,
    characterId: number,
    userId: string,
    createdAt: Date = new Date(),
  ) {
    await insertEveAccount(harness.db, { id, characterId, userId }, {
      createdAt,
      updatedAt: createdAt,
    });
  }

  async function seedSession(
    id: string,
    userId: string,
    expiresAt: Date,
  ) {
    await harness.db.insert(session).values({
      id,
      userId,
      token: `token-${id}`,
      expiresAt,
    });
  }

  it('selects one deterministic oldest EVE account and preserves zero-account admin rows', async () => {
    const tiedAt = new Date('2026-07-01T00:00:00Z');
    await harness.db.update(user).set({ role: 'ADMIN', name: 'Alpha Admin' }).where(eq(user.id, SOURCE_ID));
    await harness.db.update(user).set({ role: 'ADMIN', name: 'Beta Admin' }).where(eq(user.id, TARGET_ID));
    await seedEveAccount('account-b', SURVIVOR_CHAR, SOURCE_ID, tiedAt);
    await seedEveAccount('account-a', MOVED_CHAR, SOURCE_ID, tiedAt);

    const rows = await listAdminUsers();

    expect(rows).toEqual([
      {
        userId: SOURCE_ID,
        characterId: MOVED_CHAR,
        name: 'Alpha Admin',
        portraitUrl: '',
        role: 'ADMIN',
      },
      {
        userId: TARGET_ID,
        characterId: null,
        name: 'Beta Admin',
        portraitUrl: '',
        role: 'ADMIN',
      },
    ]);
    await expect(getUserById(SOURCE_ID)).resolves.toMatchObject({ characterId: MOVED_CHAR });
    await expect(getUserByCharacterId(SURVIVOR_CHAR)).resolves.toMatchObject({
      userId: SOURCE_ID,
      characterId: SURVIVOR_CHAR,
    });
  });

  it('returns one row past the search cap without a false truncation signal at the exact cap', async () => {
    const makeSearchUsers = (count: number) =>
      Array.from({ length: count }, (_, index) => ({
        id: `search-${index}`,
        name: `Search Pilot ${String(index).padStart(2, '0')}`,
        email: `search-${index}@eve.invalid`,
      }));

    await harness.db.insert(user).values(makeSearchUsers(CHARACTER_SEARCH_LIMIT + 2));
    await expect(searchUsersByLinkedCharacterName(' search pilot ')).resolves.toHaveLength(
      CHARACTER_SEARCH_LIMIT + 1,
    );

    await harness.db.delete(user).where(eq(user.role, 'USER'));
    await harness.db.insert(user).values(makeSearchUsers(CHARACTER_SEARCH_LIMIT));
    await expect(searchUsersByLinkedCharacterName('search pilot')).resolves.toHaveLength(
      CHARACTER_SEARCH_LIMIT,
    );
  });

  it('refreshes role reads, returns null for unknown users, and reports unlink misses', async () => {
    await seedEveAccount('source-account', MOVED_CHAR, SOURCE_ID);

    await expect(setUserRole(SOURCE_ID, 'ADMIN')).resolves.toMatchObject({
      userId: SOURCE_ID,
      role: 'ADMIN',
    });
    await expect(setUserRole('missing-user', 'ADMIN')).resolves.toBeNull();
    await expect(deleteLinkedCharacter(SOURCE_ID, MOVED_CHAR)).resolves.toBe(true);
    await expect(deleteLinkedCharacter(SOURCE_ID, MOVED_CHAR)).resolves.toBe(false);
  });

  it('counts only unexpired sessions and revokes the exact stored row count', async () => {
    await seedSession('future', SOURCE_ID, new Date(Date.now() + 60_000));
    await seedSession('expired', SOURCE_ID, new Date(Date.now() - 60_000));

    await expect(getActiveSessionCount(SOURCE_ID)).resolves.toBe(1);
    await expect(revokeUserSessions(SOURCE_ID)).resolves.toBe(2);
    await expect(getActiveSessionCount(SOURCE_ID)).resolves.toBe(0);
  });

  it('moves the last character, deletes the emptied source, and cascades its sessions', async () => {
    await seedEveAccount('moved', MOVED_CHAR, SOURCE_ID);
    await seedSession('source-session', SOURCE_ID, new Date(Date.now() + 60_000));

    await expect(
      reassignCharacter({
        characterId: MOVED_CHAR,
        fromUserId: SOURCE_ID,
        toUserId: TARGET_ID,
      }),
    ).resolves.toEqual({ sourceDeleted: true });

    const [moved] = await harness.db
      .select({ userId: account.userId })
      .from(account)
      .where(eq(account.accountId, String(MOVED_CHAR)));
    expect(moved?.userId).toBe(TARGET_ID);
    await expect(getUserById(SOURCE_ID)).resolves.toBeNull();
    await expect(revokeUserSessions(SOURCE_ID)).resolves.toBe(0);
  });

  it('keeps a surviving source and repoints its moved active character', async () => {
    await harness.db
      .update(user)
      .set({ activeCharacterId: MOVED_CHAR })
      .where(eq(user.id, SOURCE_ID));
    await seedEveAccount('moved', MOVED_CHAR, SOURCE_ID, new Date('2026-07-02T00:00:00Z'));
    await seedEveAccount('survivor', SURVIVOR_CHAR, SOURCE_ID, new Date('2026-07-01T00:00:00Z'));

    await expect(
      reassignCharacter({
        characterId: MOVED_CHAR,
        fromUserId: SOURCE_ID,
        toUserId: TARGET_ID,
      }),
    ).resolves.toEqual({ sourceDeleted: false });
    await expect(getStoredActiveCharacterId(SOURCE_ID)).resolves.toBe(SURVIVOR_CHAR);
    await expect(getUserById(SOURCE_ID)).resolves.not.toBeNull();
  });

  it('pins the current CAS-losing branch that deletes an already-empty source user', async () => {
    await seedEveAccount('already-owned', MOVED_CHAR, TARGET_ID);
    await seedSession('empty-source-session', SOURCE_ID, new Date(Date.now() + 60_000));

    await expect(
      reassignCharacter({
        characterId: MOVED_CHAR,
        fromUserId: SOURCE_ID,
        toUserId: TARGET_ID,
      }),
    ).resolves.toEqual({ sourceDeleted: true });

    await expect(getUserById(SOURCE_ID)).resolves.toBeNull();
    await expect(revokeUserSessions(SOURCE_ID)).resolves.toBe(0);
    await expect(getUserByCharacterId(MOVED_CHAR)).resolves.toMatchObject({ userId: TARGET_ID });
  });
});
