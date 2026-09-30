import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { directClient, getDeletionClient } from '@/db';
import {
  createDbTestHarness,
  seedEveAccount as insertEveAccount,
  seedCharacter,
  seedUser as insertUser,
} from '@/db/__tests__/support/db-test-harness';
import { getStoredActiveCharacterId } from './linked-characters';

import {
  CHARACTER_SEARCH_LIMIT,
  deleteLinkedCharacter,
  getAccountTotals,
  getActiveSessionCount,
  getUserByCharacterId,
  getUserById,
  listAdminUsers,
  reassignCharacter,
  revokeUserSessions,
  searchUsersByLinkedCharacterName,
  setUserRole,
} from './admin-users';
import { pendingDeletions } from './deletion-schema';
import { PendingDeletionError } from './deletion-jobs';
import { account, session, user } from '@/db/auth-schema';

const runners = {
  runBeforeUserDelete: vi.fn().mockResolvedValue(undefined),
  runBeforeCharacterUnlink: vi.fn().mockResolvedValue([]),
  runAfterFailedCharacterUnlink: vi.fn().mockResolvedValue(undefined),
  runAfterCharacterUnlink: vi.fn().mockResolvedValue(undefined),
  runAfterCharacterLinkChanged: vi.fn().mockResolvedValue(undefined),
};

const harness = await createDbTestHarness({
  schema: 'test_auth_admin_users',
  tables: ['user', 'account', 'session', 'characters', 'pending_deletions'],
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
    runners.runAfterFailedCharacterUnlink.mockReset().mockResolvedValue(undefined);
    runners.runBeforeUserDelete.mockReset().mockResolvedValue(undefined);
    runners.runAfterCharacterLinkChanged.mockReset().mockResolvedValue(undefined);
    await seedUser(SOURCE_ID, { name: 'Source Pilot' });
    await seedUser(TARGET_ID, { name: 'Target Pilot' });
  });

  it('steers direct identity and deletion transactions into the disposable schema', async () => {
    for (const client of [directClient, getDeletionClient()]) {
      const [row] = await client.unsafe('select current_schema() as schema');
      expect(row?.schema).toBe('test_auth_admin_users');
    }
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
        name: `Character ${MOVED_CHAR}`,
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

  it('keeps displayed identity coherent and finds an account through any linked character', async () => {
    await seedEveAccount('primary', MOVED_CHAR, SOURCE_ID, new Date('2026-07-01'));
    await seedEveAccount('alt', SURVIVOR_CHAR, SOURCE_ID, new Date('2026-07-02'));
    await seedCharacter(harness.db, MOVED_CHAR, { name: 'Primary Pilot', portraitUrl: 'primary-portrait' });
    await seedCharacter(harness.db, SURVIVOR_CHAR, { name: 'Hidden Alt', portraitUrl: 'alt-portrait' });
    await harness.db.update(user).set({ role: 'ADMIN', name: 'Unrelated account label' }).where(eq(user.id, SOURCE_ID));

    const canonical = await getUserById(SOURCE_ID);
    expect(canonical).toMatchObject({ characterId: MOVED_CHAR, name: 'Primary Pilot', portraitUrl: 'primary-portrait' });
    expect(await listAdminUsers()).toEqual([canonical]);
    expect(await searchUsersByLinkedCharacterName('hidden alt')).toEqual([canonical]);
    expect(await searchUsersByLinkedCharacterName('pilot')).toHaveLength(2);
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
    await expect(deleteLinkedCharacter(SOURCE_ID, MOVED_CHAR, runners)).resolves.toBe(true);
    expect(runners.runBeforeCharacterUnlink).toHaveBeenCalledWith({
      userId: SOURCE_ID, characterId: MOVED_CHAR,
    });
    expect(runners.runAfterCharacterLinkChanged).toHaveBeenCalledWith({
      userId: SOURCE_ID,
      characterId: MOVED_CHAR,
    });
    await expect(deleteLinkedCharacter(SOURCE_ID, MOVED_CHAR, runners)).resolves.toBe(false);
  });

  it('repairs the active character after operator unlink even if history erasure fails', async () => {
    await harness.db.update(user).set({ activeCharacterId: MOVED_CHAR }).where(eq(user.id, SOURCE_ID));
    await seedEveAccount('moved', MOVED_CHAR, SOURCE_ID);
    await seedEveAccount('survivor', SURVIVOR_CHAR, SOURCE_ID);
    const failure = new Error('history deletion failed');
    runners.runAfterCharacterUnlink.mockRejectedValueOnce(failure);
    await expect(deleteLinkedCharacter(SOURCE_ID, MOVED_CHAR, runners)).rejects.toBe(failure);
    expect(await getStoredActiveCharacterId(SOURCE_ID)).toBe(SURVIVOR_CHAR);
    expect(await getUserByCharacterId(MOVED_CHAR)).toBeNull();
    expect(runners.runAfterCharacterLinkChanged).toHaveBeenCalledWith({ userId: SOURCE_ID, characterId: MOVED_CHAR });
  });

  it.each([false, true])('finishes reassignment source cleanup when history erasure fails (survivor: %s)', async (survivor) => {
    await harness.db.update(user).set({ activeCharacterId: MOVED_CHAR }).where(eq(user.id, SOURCE_ID));
    await seedEveAccount('moved', MOVED_CHAR, SOURCE_ID);
    if (survivor) await seedEveAccount('survivor', SURVIVOR_CHAR, SOURCE_ID);
    const failure = new Error('history deletion failed');
    runners.runAfterCharacterUnlink.mockRejectedValueOnce(failure);
    await expect(reassignCharacter({ characterId: MOVED_CHAR, fromUserId: SOURCE_ID, toUserId: TARGET_ID, runners })).rejects.toBe(failure);
    expect(await getUserByCharacterId(MOVED_CHAR)).toMatchObject({ userId: TARGET_ID });
    if (survivor) expect(await getStoredActiveCharacterId(SOURCE_ID)).toBe(SURVIVOR_CHAR);
    else expect(await getUserById(SOURCE_ID)).toBeNull();
    expect(runners.runAfterCharacterLinkChanged).toHaveBeenCalledWith({ userId: SOURCE_ID, characterId: MOVED_CHAR });
  });

  it('counts only unexpired sessions and revokes the exact stored row count', async () => {
    await seedSession('future', SOURCE_ID, new Date(Date.now() + 60_000));
    await seedSession('expired', SOURCE_ID, new Date(Date.now() - 60_000));

    await expect(getActiveSessionCount(SOURCE_ID)).resolves.toBe(1);
    await expect(revokeUserSessions(SOURCE_ID)).resolves.toBe(2);
    await expect(getActiveSessionCount(SOURCE_ID)).resolves.toBe(0);
  });

  it('counts every user and each distinct linked EVE character', async () => {
    await seedEveAccount('moved', MOVED_CHAR, SOURCE_ID);
    await seedEveAccount('survivor', SURVIVOR_CHAR, SOURCE_ID);
    await harness.db.insert(account).values({
      id: 'discord',
      accountId: 'not-a-character',
      providerId: 'discord',
      userId: TARGET_ID,
    });

    await expect(getAccountTotals()).resolves.toEqual({ users: 2, characters: 2 });
  });

  it('moves the last character, deletes the emptied source, and cascades its sessions', async () => {
    await seedEveAccount('moved', MOVED_CHAR, SOURCE_ID);
    await seedSession('source-session', SOURCE_ID, new Date(Date.now() + 60_000));

    await expect(
      reassignCharacter({
        characterId: MOVED_CHAR,
        fromUserId: SOURCE_ID,
        toUserId: TARGET_ID,
        runners,
      }),
    ).resolves.toEqual({ sourceDeleted: true });
    expect(runners.runBeforeCharacterUnlink).toHaveBeenCalledWith({
      userId: SOURCE_ID, characterId: MOVED_CHAR,
    });
    expect(runners.runBeforeUserDelete).toHaveBeenCalledWith(SOURCE_ID);
    expect(runners.runAfterCharacterLinkChanged).toHaveBeenCalledWith({
      userId: SOURCE_ID,
      characterId: MOVED_CHAR,
    });

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
        runners,
      }),
    ).resolves.toEqual({ sourceDeleted: false });
    expect(runners.runAfterCharacterLinkChanged).toHaveBeenCalledWith({
      userId: SOURCE_ID,
      characterId: MOVED_CHAR,
    });
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
        runners,
      }),
    ).resolves.toEqual({ sourceDeleted: true });
    expect(runners.runBeforeUserDelete).toHaveBeenCalledWith(SOURCE_ID);

    await expect(getUserById(SOURCE_ID)).resolves.toBeNull();
    await expect(revokeUserSessions(SOURCE_ID)).resolves.toBe(0);
    await expect(getUserByCharacterId(MOVED_CHAR)).resolves.toMatchObject({ userId: TARGET_ID });
  });

  it('refuses admin reassignment and unlink while an independent deletion receipt owns the link', async () => {
    await insertEveAccount(harness.db, { id: 'pending-link', characterId: MOVED_CHAR, userId: SOURCE_ID });
    await harness.db.insert(pendingDeletions).values({
      userId: SOURCE_ID, scope: 'character', accountRowId: 'pending-link',
      characterId: MOVED_CHAR, characterIds: [MOVED_CHAR], requestedAt: new Date(),
    });
    await expect(reassignCharacter({ characterId: MOVED_CHAR, fromUserId: SOURCE_ID, toUserId: TARGET_ID, runners })).rejects.toBeInstanceOf(PendingDeletionError);
    await expect(deleteLinkedCharacter(SOURCE_ID, MOVED_CHAR, runners)).rejects.toBeInstanceOf(PendingDeletionError);
    expect((await harness.db.select().from(account))[0]?.userId).toBe(SOURCE_ID);
    expect(runners.runAfterFailedCharacterUnlink).toHaveBeenCalledWith(MOVED_CHAR);
    expect(await harness.db.select().from(pendingDeletions)).toHaveLength(1);
  });

  it('refuses admin movement in the incoming request-marker window before its receipt is enqueued', async () => {
    await insertEveAccount(harness.db, { id: 'pending-link', characterId: MOVED_CHAR, userId: SOURCE_ID }, { deletionRequestedAt: new Date() });
    await expect(reassignCharacter({ characterId: MOVED_CHAR, fromUserId: SOURCE_ID, toUserId: TARGET_ID, runners })).rejects.toBeInstanceOf(PendingDeletionError);
    expect((await harness.db.select().from(account))[0]?.userId).toBe(SOURCE_ID);
    expect(runners.runAfterFailedCharacterUnlink).toHaveBeenCalledWith(MOVED_CHAR);
  });

});
