import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usageLogs } from '@/data/telemetry/schema';
import {
  createDbTestHarness,
  seedCharacter as insertCharacter,
  seedEveAccount as insertEveAccount,
  seedUser as insertUser,
} from '@/db/test-support/db-test-harness';

const oauthState = vi.hoisted(() => ({ value: null as unknown, error: null as Error | null }));

vi.mock('better-auth/api', () => ({
  getOAuthState: async () => {
    if (oauthState.error) throw oauthState.error;
    return oauthState.value;
  },
}));
vi.mock('@/platform/auth/eve-token-service', () => ({ revokeCharacterToken: vi.fn() }));

import {
  absorbLinkedCharacterOnProof,
} from '@/platform/auth/owner-transfer';
import {
  purgeTransferredCharacter,
  reconcileCharacterOwner,
} from './owner-transfer';
import { account, characters, session, user } from '@/db/auth-schema';
import { syntheticEmail } from '@/platform/auth/synthetic-email';

const harness = await createDbTestHarness({
  schema: 'test_auth_owner_transfer',
  tables: ['user', 'account', 'characters', 'session', 'usage_logs', 'character_skills'],
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
    NEXT_PUBLIC_CONVEX_URL: '',
    CONVEX_SERVICE_SECRET: '',
  },
  resetBetweenTests: 'delete',
});

const SOURCE_ID = 'transfer-source';
const TARGET_ID = 'transfer-target';
const MOVED_CHAR = 90000031;
const SURVIVOR_CHAR = 90000032;

describe.skipIf(!harness.reachable)('owner-transfer queries (real Postgres)', () => {
  beforeEach(async () => {
    oauthState.value = null;
    oauthState.error = null;
    await seedUser(SOURCE_ID, MOVED_CHAR);
    await seedUser(TARGET_ID, null);
  });

  async function seedUser(id: string, activeCharacterId: number | null) {
    await insertUser(harness.db, id, {
      email: syntheticEmail(activeCharacterId ?? 90000999),
      activeCharacterId,
    });
  }

  async function seedCharacter(
    characterId: number,
    preferences: Record<string, unknown> = { privateNote: 'owner-authored' },
  ) {
    await insertCharacter(harness.db, characterId, {
      portraitUrl: `https://images.example/${characterId}`,
      preferences,
    });
  }

  async function seedEveAccount(
    id: string,
    characterId: number,
    userId: string,
    ownerHash: string | null,
    createdAt: Date = new Date(),
  ) {
    await insertEveAccount(harness.db, { id, characterId, userId }, {
      ownerHash,
      createdAt,
      updatedAt: createdAt,
    });
  }

  async function readAccountOwnerHash(characterId: number): Promise<string | null | undefined> {
    const [row] = await harness.db
      .select({ ownerHash: account.ownerHash })
      .from(account)
      .where(eq(account.accountId, String(characterId)))
      .limit(1);
    return row?.ownerHash;
  }

  it('pins null-claim, first-link, backfill, and matching-hash reconcile branches', async () => {
    await reconcileCharacterOwner(MOVED_CHAR, null);
    await reconcileCharacterOwner(MOVED_CHAR, 'owner-one');
    expect(await readAccountOwnerHash(MOVED_CHAR)).toBeUndefined();

    await seedEveAccount('moved', MOVED_CHAR, SOURCE_ID, null);
    await reconcileCharacterOwner(MOVED_CHAR, 'owner-one');
    expect(await readAccountOwnerHash(MOVED_CHAR)).toBe('owner-one');

    await reconcileCharacterOwner(MOVED_CHAR, 'owner-one');
    expect(await readAccountOwnerHash(MOVED_CHAR)).toBe('owner-one');
  });

  it('uses the credential tier on owner mismatch, deleting custody but retaining cache rows', async () => {
    await seedCharacter(MOVED_CHAR);
    await seedEveAccount('moved', MOVED_CHAR, SOURCE_ID, 'owner-one');
    await harness.db.insert(session).values({
      id: 'source-session',
      token: 'source-session-token',
      userId: SOURCE_ID,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await harness.sql`
      INSERT INTO character_skills (character_id, total_sp, queue)
      VALUES (${MOVED_CHAR}, 123, '[]'::jsonb)
    `;
    await harness.db.insert(usageLogs).values({
      characterId: MOVED_CHAR,
      action: 'auth_login',
      metadata: { source: 'before-transfer' },
    });

    await reconcileCharacterOwner(MOVED_CHAR, 'owner-two');

    expect(await readAccountOwnerHash(MOVED_CHAR)).toBeUndefined();
    expect(
      await harness.db.select().from(user).where(eq(user.id, SOURCE_ID)),
    ).toHaveLength(0);
    expect(
      await harness.db.select().from(session).where(eq(session.userId, SOURCE_ID)),
    ).toHaveLength(0);
    const [skillRow] = await harness.sql<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM character_skills
      WHERE character_id = ${MOVED_CHAR}
    `;
    expect(skillRow?.count).toBe(1);
    expect(
      await harness.db.select().from(usageLogs).where(eq(usageLogs.characterId, MOVED_CHAR)),
    ).toHaveLength(1);
    const [profile] = await harness.db
      .select({ preferences: characters.preferences })
      .from(characters)
      .where(eq(characters.characterId, MOVED_CHAR));
    expect(profile?.preferences).toEqual({});
  });

  it('keeps a prior owner with siblings, rebinding identity email and active character', async () => {
    await seedCharacter(MOVED_CHAR);
    await seedEveAccount(
      'survivor',
      SURVIVOR_CHAR,
      SOURCE_ID,
      'owner-one',
      new Date('2026-07-01T00:00:00Z'),
    );
    await seedEveAccount(
      'moved',
      MOVED_CHAR,
      SOURCE_ID,
      'owner-one',
      new Date('2026-07-02T00:00:00Z'),
    );

    await purgeTransferredCharacter(SOURCE_ID, MOVED_CHAR);

    const [source] = await harness.db
      .select({ email: user.email, activeCharacterId: user.activeCharacterId })
      .from(user)
      .where(eq(user.id, SOURCE_ID));
    expect(source).toEqual({
      email: syntheticEmail(SURVIVOR_CHAR),
      activeCharacterId: SURVIVOR_CHAR,
    });
    expect(await readAccountOwnerHash(MOVED_CHAR)).toBeUndefined();
    expect(await readAccountOwnerHash(SURVIVOR_CHAR)).toBe('owner-one');
  });

  it('never absorbs sign-in, fresh-link, or same-user relink paths', async () => {
    oauthState.value = { callbackURL: '/' };
    await expect(absorbLinkedCharacterOnProof(MOVED_CHAR)).resolves.toEqual({ absorbed: false });

    oauthState.value = { link: { userId: TARGET_ID } };
    await expect(absorbLinkedCharacterOnProof(MOVED_CHAR)).resolves.toEqual({ absorbed: false });

    await seedEveAccount('target-owned', MOVED_CHAR, TARGET_ID, 'owner-one');
    await expect(absorbLinkedCharacterOnProof(MOVED_CHAR)).resolves.toEqual({ absorbed: false });
    expect(
      await harness.db.select().from(usageLogs).where(eq(usageLogs.action, 'auth_absorb')),
    ).toHaveLength(0);
  });

  it('absorbs a last character, deletes the source, and writes the audit row asynchronously', async () => {
    await seedEveAccount('moved', MOVED_CHAR, SOURCE_ID, 'owner-one');
    oauthState.value = { link: { userId: TARGET_ID } };

    await expect(absorbLinkedCharacterOnProof(MOVED_CHAR)).resolves.toEqual({ absorbed: true });

    expect(
      await harness.db.select().from(user).where(eq(user.id, SOURCE_ID)),
    ).toHaveLength(0);
    expect(
      await harness.db.select().from(account).where(eq(account.userId, TARGET_ID)),
    ).toHaveLength(1);
    await vi.waitFor(async () => {
      const [event] = await harness.db
        .select()
        .from(usageLogs)
        .where(eq(usageLogs.action, 'auth_absorb'))
        .limit(1);
      expect(event).toMatchObject({
        characterId: MOVED_CHAR,
        metadata: {
          fromUserId: SOURCE_ID,
          toUserId: TARGET_ID,
          sourceDeleted: true,
        },
      });
    });
  });

  it('absorbs from a surviving source and closes its synthetic-email hazard', async () => {
    await seedEveAccount(
      'survivor',
      SURVIVOR_CHAR,
      SOURCE_ID,
      'owner-one',
      new Date('2026-07-01T00:00:00Z'),
    );
    await seedEveAccount(
      'moved',
      MOVED_CHAR,
      SOURCE_ID,
      'owner-one',
      new Date('2026-07-02T00:00:00Z'),
    );
    oauthState.value = { link: { userId: TARGET_ID } };

    await expect(absorbLinkedCharacterOnProof(MOVED_CHAR)).resolves.toEqual({ absorbed: true });

    const [source] = await harness.db
      .select({ email: user.email, activeCharacterId: user.activeCharacterId })
      .from(user)
      .where(eq(user.id, SOURCE_ID));
    expect(source).toEqual({
      email: syntheticEmail(SURVIVOR_CHAR),
      activeCharacterId: SURVIVOR_CHAR,
    });
    expect(
      await harness.db
        .select()
        .from(account)
        .where(eq(account.accountId, String(MOVED_CHAR))),
    ).toMatchObject([{ userId: TARGET_ID }]);
  });
});
