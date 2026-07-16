import { eq } from 'drizzle-orm';
import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { usageLogs } from '@/data/telemetry/schema';
import {
  addForeignKey,
  canReachDb,
  dropDisposableSchema,
  LOCAL_DB_URL,
  schemaUrl,
  setupDisposableSchema,
} from '@/db/test-support/db-coverage-harness';

const oauthState = vi.hoisted(() => ({ value: null as unknown, error: null as Error | null }));

vi.mock('better-auth/api', () => ({
  getOAuthState: async () => {
    if (oauthState.error) throw oauthState.error;
    return oauthState.value;
  },
}));
vi.mock('./eve-token-service', () => ({ revokeCharacterToken: vi.fn() }));

import {
  absorbLinkedCharacterOnProof,
  purgeTransferredCharacter,
  reconcileCharacterOwner,
} from './owner-transfer';
import { account, characters, session, user } from './schema';
import { syntheticEmail } from './synthetic-email';

const SCHEMA = 'test_auth_owner_transfer';
const baseUrl = process.env.DATABASE_URL ?? LOCAL_DB_URL;
const reachable = await canReachDb(baseUrl);

const SOURCE_ID = 'transfer-source';
const TARGET_ID = 'transfer-target';
const MOVED_CHAR = 90000031;
const SURVIVOR_CHAR = 90000032;

describe.skipIf(!reachable)('owner-transfer queries (real Postgres)', () => {
  let adminClient: ReturnType<typeof postgres>;
  let seedDb: ReturnType<typeof drizzlePg>;

  beforeAll(async () => {
    vi.stubEnv('LOCAL_DB_DRIVER', 'postgres-js');
    vi.stubEnv('DATABASE_URL', schemaUrl(baseUrl, SCHEMA));
    vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', '');
    vi.stubEnv('CONVEX_SERVICE_SECRET', '');

    adminClient = postgres(schemaUrl(baseUrl, SCHEMA), { max: 4, onnotice: () => {} });
    await setupDisposableSchema(adminClient, SCHEMA, [
      'user',
      'account',
      'characters',
      'session',
      'usage_logs',
      'character_skills',
    ]);
    await addForeignKey(adminClient, SCHEMA, {
      table: 'account',
      column: 'user_id',
      refTable: 'user',
      refColumn: 'id',
      onDelete: 'cascade',
    });
    await addForeignKey(adminClient, SCHEMA, {
      table: 'session',
      column: 'user_id',
      refTable: 'user',
      refColumn: 'id',
      onDelete: 'cascade',
    });
    seedDb = drizzlePg(adminClient);
  });

  afterAll(async () => {
    const proxyClient = (
      (await import('@/db')).db as unknown as { $client: ReturnType<typeof postgres> }
    ).$client;
    await proxyClient.end({ timeout: 5 }).catch(() => {});
    await dropDisposableSchema(adminClient, SCHEMA);
    await adminClient.end({ timeout: 5 }).catch(() => {});
    vi.unstubAllEnvs();
  });

  beforeEach(async () => {
    oauthState.value = null;
    oauthState.error = null;
    await adminClient.unsafe('DELETE FROM session');
    await adminClient.unsafe('DELETE FROM account');
    await adminClient.unsafe('DELETE FROM usage_logs');
    await adminClient.unsafe('DELETE FROM character_skills');
    await adminClient.unsafe('DELETE FROM characters');
    await adminClient.unsafe('DELETE FROM "user"');
    await seedUser(SOURCE_ID, MOVED_CHAR);
    await seedUser(TARGET_ID, null);
  });

  async function seedUser(id: string, activeCharacterId: number | null) {
    await seedDb.insert(user).values({
      id,
      name: `Pilot ${id}`,
      email: syntheticEmail(activeCharacterId ?? 90000999),
      activeCharacterId,
    });
  }

  async function seedCharacter(
    characterId: number,
    preferences: Record<string, unknown> = { privateNote: 'owner-authored' },
  ) {
    await seedDb.insert(characters).values({
      characterId,
      name: `Character ${characterId}`,
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
    await seedDb.insert(account).values({
      id,
      accountId: String(characterId),
      providerId: 'eve',
      userId,
      ownerHash,
      createdAt,
      updatedAt: createdAt,
    });
  }

  async function readAccountOwnerHash(characterId: number): Promise<string | null | undefined> {
    const [row] = await seedDb
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
    await seedDb.insert(session).values({
      id: 'source-session',
      token: 'source-session-token',
      userId: SOURCE_ID,
      expiresAt: new Date(Date.now() + 60_000),
    });
    await adminClient`
      INSERT INTO character_skills (character_id, total_sp, queue)
      VALUES (${MOVED_CHAR}, 123, '[]'::jsonb)
    `;
    await seedDb.insert(usageLogs).values({
      characterId: MOVED_CHAR,
      action: 'auth_login',
      metadata: { source: 'before-transfer' },
    });

    await reconcileCharacterOwner(MOVED_CHAR, 'owner-two');

    expect(await readAccountOwnerHash(MOVED_CHAR)).toBeUndefined();
    expect(
      await seedDb.select().from(user).where(eq(user.id, SOURCE_ID)),
    ).toHaveLength(0);
    expect(
      await seedDb.select().from(session).where(eq(session.userId, SOURCE_ID)),
    ).toHaveLength(0);
    const [skillRow] = await adminClient<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM character_skills
      WHERE character_id = ${MOVED_CHAR}
    `;
    expect(skillRow?.count).toBe(1);
    expect(
      await seedDb.select().from(usageLogs).where(eq(usageLogs.characterId, MOVED_CHAR)),
    ).toHaveLength(1);
    const [profile] = await seedDb
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

    const [source] = await seedDb
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
      await seedDb.select().from(usageLogs).where(eq(usageLogs.action, 'auth_absorb')),
    ).toHaveLength(0);
  });

  it('absorbs a last character, deletes the source, and writes the audit row asynchronously', async () => {
    await seedEveAccount('moved', MOVED_CHAR, SOURCE_ID, 'owner-one');
    oauthState.value = { link: { userId: TARGET_ID } };

    await expect(absorbLinkedCharacterOnProof(MOVED_CHAR)).resolves.toEqual({ absorbed: true });

    expect(
      await seedDb.select().from(user).where(eq(user.id, SOURCE_ID)),
    ).toHaveLength(0);
    expect(
      await seedDb.select().from(account).where(eq(account.userId, TARGET_ID)),
    ).toHaveLength(1);
    await vi.waitFor(async () => {
      const [event] = await seedDb
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

    const [source] = await seedDb
      .select({ email: user.email, activeCharacterId: user.activeCharacterId })
      .from(user)
      .where(eq(user.id, SOURCE_ID));
    expect(source).toEqual({
      email: syntheticEmail(SURVIVOR_CHAR),
      activeCharacterId: SURVIVOR_CHAR,
    });
    expect(
      await seedDb
        .select()
        .from(account)
        .where(eq(account.accountId, String(MOVED_CHAR))),
    ).toMatchObject([{ userId: TARGET_ID }]);
  });
});
