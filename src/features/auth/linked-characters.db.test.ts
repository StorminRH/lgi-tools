import { asc, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDbTestHarness,
  seedCharacter as insertCharacter,
  seedEveAccount as insertEveAccount,
  seedUser as insertUser,
} from '@/db/test-support/db-test-harness';
import {
  accountBelongsToUser,
  getStoredActiveCharacterId,
  listLinkedCharacters,
  repointActiveToOldest,
  resolveActiveCharacter,
  setActiveCharacter,
  upsertCharacterOnLogin,
} from './linked-characters';
import { account, characters } from './schema';

const harness = await createDbTestHarness({
  schema: 'test_auth_linked_characters',
  tables: ['user', 'account', 'characters'],
  steerDbProxy: true,
  resetBetweenTests: 'delete',
});

const USER_ID = 'linked-user';
const FIRST_CHAR = 90000001;
const SECOND_CHAR = 90000002;

describe.skipIf(!harness.reachable)('linked-character queries (real Postgres)', () => {
  beforeEach(async () => {
    await seedUser(USER_ID);
  });

  async function seedUser(id: string, activeCharacterId: number | null = null) {
    await insertUser(harness.db, id, {
      name: `Pilot ${id}`,
      email: `${id}@eve.invalid`,
      activeCharacterId,
    });
  }

  async function seedCharacter(
    characterId: number,
    overrides: Partial<typeof characters.$inferInsert> = {},
  ) {
    await insertCharacter(harness.db, characterId, {
      portraitUrl: `https://images.example/${characterId}`,
      ...overrides,
    });
  }

  async function seedEveAccount(
    id: string,
    characterId: number,
    createdAt: Date,
    overrides: Partial<typeof account.$inferInsert> = {},
  ) {
    await insertEveAccount(harness.db, { id, characterId, userId: USER_ID }, {
      createdAt,
      updatedAt: createdAt,
      ...overrides,
    });
  }

  it('updates login-owned profile fields while preserving role and preferences', async () => {
    await seedCharacter(FIRST_CHAR, {
      name: 'Old Name',
      portraitUrl: 'https://images.example/old',
      role: 'ADMIN',
      preferences: { pinned: true },
    });

    await upsertCharacterOnLogin({
      characterId: FIRST_CHAR,
      name: 'New Name',
      portraitUrl: 'https://images.example/new',
    });

    const [row] = await harness.db
      .select()
      .from(characters)
      .where(eq(characters.characterId, FIRST_CHAR))
      .limit(1);
    expect(row).toMatchObject({
      name: 'New Name',
      portraitUrl: 'https://images.example/new',
      role: 'ADMIN',
      preferences: { pinned: true },
    });
  });

  it('lists accounts oldest-first and preserves profile-lag fallbacks', async () => {
    const older = new Date('2026-07-01T00:00:00Z');
    const newer = new Date('2026-07-02T00:00:00Z');
    await seedCharacter(SECOND_CHAR, {
      corporationId: 98000002,
      affiliationRefreshedAt: new Date('2026-07-02T01:00:00Z'),
    });
    await seedEveAccount('newer', SECOND_CHAR, newer, { refreshToken: 'token', scope: 'scope-b' });
    await seedEveAccount('older', FIRST_CHAR, older, { refreshToken: null, scope: 'scope-a' });

    const rows = await listLinkedCharacters(USER_ID);

    expect(rows.map((row) => row.characterId)).toEqual([FIRST_CHAR, SECOND_CHAR]);
    expect(rows[0]).toMatchObject({
      name: `Character ${FIRST_CHAR}`,
      hasRefreshToken: false,
      corporationId: null,
      affiliationRefreshedAt: null,
    });
    expect(rows[1]).toMatchObject({
      name: `Character ${SECOND_CHAR}`,
      hasRefreshToken: true,
      corporationId: 98000002,
    });
  });

  it('resolves preferred, fallback, null, and stale-preference backfill behavior', async () => {
    const older = new Date('2026-07-01T00:00:00Z');
    const newer = new Date('2026-07-02T00:00:00Z');
    await seedCharacter(FIRST_CHAR);
    await seedCharacter(SECOND_CHAR);
    await seedEveAccount('older', FIRST_CHAR, older);
    await seedEveAccount('newer', SECOND_CHAR, newer);

    await expect(resolveActiveCharacter(USER_ID, SECOND_CHAR)).resolves.toMatchObject({
      characterId: SECOND_CHAR,
    });
    await expect(resolveActiveCharacter(USER_ID, null)).resolves.toMatchObject({
      characterId: FIRST_CHAR,
    });
    await expect(resolveActiveCharacter(USER_ID, 99999999)).resolves.toMatchObject({
      characterId: FIRST_CHAR,
    });
    await vi.waitFor(async () => {
      expect(await getStoredActiveCharacterId(USER_ID)).toBe(FIRST_CHAR);
    });

    await harness.db.delete(account).where(eq(account.userId, USER_ID));
    await expect(resolveActiveCharacter(USER_ID, null)).resolves.toBeNull();
  });

  it('denies unowned characters and stores only explicitly selected linked ids', async () => {
    await seedEveAccount('owned', FIRST_CHAR, new Date('2026-07-01T00:00:00Z'));
    await seedUser('other-user');
    await harness.db.insert(account).values({
      id: 'other',
      accountId: String(SECOND_CHAR),
      providerId: 'eve',
      userId: 'other-user',
    });

    await expect(accountBelongsToUser(USER_ID, FIRST_CHAR)).resolves.toBe(true);
    await expect(accountBelongsToUser(USER_ID, SECOND_CHAR)).resolves.toBe(false);
    await setActiveCharacter(USER_ID, FIRST_CHAR);
    await expect(getStoredActiveCharacterId(USER_ID)).resolves.toBe(FIRST_CHAR);
  });

  it('repoints deterministically to the oldest survivor and stores null when empty', async () => {
    await seedEveAccount('newer', SECOND_CHAR, new Date('2026-07-02T00:00:00Z'));
    await seedEveAccount('older', FIRST_CHAR, new Date('2026-07-01T00:00:00Z'));

    await expect(repointActiveToOldest(USER_ID)).resolves.toBe(FIRST_CHAR);
    await expect(getStoredActiveCharacterId(USER_ID)).resolves.toBe(FIRST_CHAR);

    const linked = await harness.db
      .select({ id: account.id })
      .from(account)
      .where(eq(account.userId, USER_ID))
      .orderBy(asc(account.createdAt));
    expect(linked).toHaveLength(2);
    await harness.db.delete(account).where(eq(account.userId, USER_ID));

    await expect(repointActiveToOldest(USER_ID)).resolves.toBeNull();
    await expect(getStoredActiveCharacterId(USER_ID)).resolves.toBeNull();
  });
});
