import { asc, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createDbTestHarness,
  seedCharacter as insertCharacter,
  seedEveAccount as insertEveAccount,
  seedUser,
} from '@/db/__tests__/support/db-test-harness';
import { freshnessGate } from '@/lib/esi-datasets/freshness';
import {
  acknowledgeMapAccessChanges,
  captureAffiliationObservedAt,
  getUsersAffiliations,
  MAX_PENDING_BATCH,
  readPendingMapAccessChanges,
  getUserAffiliations,
  listStaleLinkedCharacterIds,
  recordCorpAccessDecision,
  updateAffiliations,
} from './affiliation-store';
import { characters, corpAccessAudit } from '@/db/auth-schema';
import { enqueueAffectedMapAccessChanges } from '@/data/maps/queries';
import { maps, mapAccess, pendingMapAccessChanges } from '@/data/maps/schema';

const AFFILIATION_WINDOW_MS = freshnessGate('affiliations').ttlMs;
const harness = await createDbTestHarness({
  schema: 'test_auth_affiliation_store',
  tables: ['user', 'account', 'characters', 'corp_access_audit', 'maps', 'map_access', 'map_access_changes'],
  foreignKeys: [{ table: 'map_access_changes', column: 'map_id', refTable: 'maps', refColumn: 'id', onDelete: 'cascade' }],
  steerDbProxy: true,
  resetBetweenTests: 'delete',
});

const USER_ID = 'affiliation-user';
const FIRST_CHAR = 90000011;
const SECOND_CHAR = 90000012;

describe.skipIf(!harness.reachable)('affiliation-store queries (real Postgres)', () => {
  beforeEach(async () => {
    await seedUser(harness.db, USER_ID, {
      name: 'Affiliation Pilot',
      email: `${USER_ID}@eve.invalid`,
    });
  });

  const mapId = (id: number) => `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`;
  async function seedCorpMap(corporationId: number) {
    await harness.db.insert(maps).values({ id: mapId(corporationId), userId: USER_ID, name: 'Corp map' });
    await harness.db.insert(mapAccess).values({ mapId: mapId(corporationId), ownerType: 'corporation', ownerId: corporationId, role: 'viewer' });
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

  async function seedEveAccount(id: string, characterId: number) {
    await insertEveAccount(harness.db, { id, characterId, userId: USER_ID });
  }

  it('returns joined affiliation rows and fails closed across missing profile fields', async () => {
    const refreshedAt = new Date('2026-07-15T12:00:00Z');
    await seedCharacter(FIRST_CHAR, {
      corporationId: 98000011,
      allianceId: 99000011,
      factionId: 500011,
      affiliationRefreshedAt: refreshedAt,
    });
    await seedEveAccount('first', FIRST_CHAR);
    await seedEveAccount('second', SECOND_CHAR);

    await expect(getUserAffiliations(USER_ID)).resolves.toEqual([
      {
        characterId: FIRST_CHAR,
        corporationId: 98000011,
        allianceId: 99000011,
        factionId: 500011,
        refreshedAt,
      },
      {
        characterId: SECOND_CHAR,
        corporationId: null,
        allianceId: null,
        factionId: null,
        refreshedAt: null,
      },
    ]);

  });

  it('returns only missing or older-than-TTL linked characters without duplicates', async () => {
    const now = Date.now();
    await seedCharacter(FIRST_CHAR, {
      affiliationRefreshedAt: new Date(now - AFFILIATION_WINDOW_MS - 1000),
    });
    await seedCharacter(SECOND_CHAR, {
      affiliationRefreshedAt: new Date(now - AFFILIATION_WINDOW_MS + 60_000),
    });
    await seedEveAccount('first', FIRST_CHAR);
    await seedEveAccount('second', SECOND_CHAR);
    await seedEveAccount('missing-profile', 90000013);

    const stale = await listStaleLinkedCharacterIds();

    expect(stale.sort((a, b) => a - b)).toEqual([FIRST_CHAR, 90000013]);
    expect(new Set(stale).size).toBe(stale.length);
  });

  it('updates existing character rows, creates no missing row, and treats empty input as a no-op', async () => {
    await seedCharacter(FIRST_CHAR);

    const result = await updateAffiliations([
      {
        characterId: FIRST_CHAR,
        corporationId: 98000021,
        allianceId: 99000021,
        factionId: null,
      },
      {
        characterId: SECOND_CHAR,
        corporationId: 98000022,
        allianceId: null,
        factionId: null,
      },
    ], new Date());
    await expect(updateAffiliations([], new Date())).resolves.toEqual({ refreshed: 0, accessChanged: false });
    expect(result).toEqual({ refreshed: 1, accessChanged: false });
    await expect(readPendingMapAccessChanges()).resolves.toEqual([]);

    const rows = await harness.db.select().from(characters).orderBy(asc(characters.characterId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      characterId: FIRST_CHAR,
      corporationId: 98000021,
      allianceId: 99000021,
      factionId: null,
    });
    expect(rows[0]?.affiliationRefreshedAt).toBeInstanceOf(Date);
  });

  const affiliation = (corporationId: number, characterId = FIRST_CHAR) => ({
    characterId, corporationId, allianceId: null, factionId: null,
  });

  it('loads several users in one batch while keeping unprofiled linked identities', async () => {
    await seedEveAccount('first', FIRST_CHAR);
    await seedUser(harness.db, 'other-user');
    await insertEveAccount(harness.db, { id: 'other', characterId: SECOND_CHAR, userId: 'other-user' });
    const rows = await getUsersAffiliations([USER_ID, 'other-user']);
    expect(rows).toHaveLength(2);
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ userId: USER_ID, characterId: FIRST_CHAR, corporationId: null }),
      expect.objectContaining({ userId: 'other-user', characterId: SECOND_CHAR, corporationId: null }),
    ]));
    await expect(getUsersAffiliations([])).resolves.toEqual([]);
  });

  it('queues old and new corporation maps once and excludes unrelated and direct grants', async () => {
    for (const corp of [98000011, 98000021, 98000031, 98000041]) await seedCorpMap(corp);
    await harness.db.insert(mapAccess).values([
      { mapId: mapId(98000011), ownerType: 'corporation', ownerId: 98000031, role: 'editor' },
      { mapId: mapId(98000041), ownerType: 'character', ownerId: 98000031, role: 'editor' },
    ]);
    await seedCharacter(FIRST_CHAR, { corporationId: 98000011 });
    await seedCharacter(SECOND_CHAR, { corporationId: 98000011 });
    const result = await updateAffiliations([
      affiliation(98000021), affiliation(98000031), affiliation(98000031, SECOND_CHAR),
    ], new Date());
    expect(result.refreshed).toBe(2);
    expect(result.accessChanged).toBe(true);
    expect((await readPendingMapAccessChanges()).map((row) => row.mapId))
      .toEqual([mapId(98000011), mapId(98000031)]);
  });

  it('queues stale restorations and corp changes, not fresh or near-boundary unchanged rows', async () => {
    await seedCorpMap(98000011);
    await seedCorpMap(98000021);
    await seedCharacter(FIRST_CHAR, { corporationId: 98000011, affiliationRefreshedAt: new Date() });
    expect((await updateAffiliations([affiliation(98000011)], new Date())).accessChanged).toBe(false);
    await expect(readPendingMapAccessChanges()).resolves.toEqual([]);
    await updateAffiliations([affiliation(98000021)], new Date());
    const pending = await readPendingMapAccessChanges();
    expect((await updateAffiliations([affiliation(98000021)], new Date())).accessChanged).toBe(false);
    await expect(readPendingMapAccessChanges()).resolves.toEqual(pending);
    await acknowledgeMapAccessChanges(pending);

    await seedCharacter(SECOND_CHAR, {
      corporationId: 98000011,
      affiliationRefreshedAt: new Date(Date.now() - AFFILIATION_WINDOW_MS - 1000),
    });
    expect((await updateAffiliations([affiliation(98000011, SECOND_CHAR)], new Date())).accessChanged).toBe(true);
    expect((await readPendingMapAccessChanges()).map((row) => row.mapId)).toEqual([mapId(98000011)]);
    await acknowledgeMapAccessChanges(await readPendingMapAccessChanges());

    const nearBoundaryChar = 90000013;
    await seedCharacter(nearBoundaryChar, {
      corporationId: 98000011,
      affiliationRefreshedAt: new Date(Date.now() - AFFILIATION_WINDOW_MS + 60_000),
    });
    expect((await updateAffiliations([affiliation(98000011, nearBoundaryChar)], new Date())).accessChanged).toBe(false);
    await expect(readPendingMapAccessChanges()).resolves.toEqual([]);
  });

  it('rolls the affiliation write back when durable enqueue fails', async () => {
    await seedCorpMap(98000021);
    const refreshedAt = new Date('2026-07-15T12:00:00Z');
    await seedCharacter(FIRST_CHAR, { corporationId: 98000011, affiliationRefreshedAt: refreshedAt });
    await harness.sql`ALTER TABLE map_access_changes ADD CONSTRAINT reject_test_map
      CHECK (map_id <> '00000000-0000-4000-8000-000098000021')`;
    try {
      await expect(updateAffiliations([affiliation(98000021)], new Date())).rejects.toThrow();
      const [stored] = await harness.db.select().from(characters);
      expect(stored).toMatchObject({ corporationId: 98000011, affiliationRefreshedAt: refreshedAt });
      await expect(readPendingMapAccessChanges()).resolves.toEqual([]);
    } finally {
      await harness.sql`ALTER TABLE map_access_changes DROP CONSTRAINT reject_test_map`;
    }
  });

  it('preserves newer work when acknowledging an older batch, including delete and reinsert', async () => {
    await seedCorpMap(98000011);
    await seedCorpMap(98000021);
    await seedCharacter(FIRST_CHAR);
    await updateAffiliations([affiliation(98000011)], new Date());
    const old = await readPendingMapAccessChanges();
    await updateAffiliations([affiliation(98000021)], new Date());
    await acknowledgeMapAccessChanges(old);
    expect(await readPendingMapAccessChanges()).toHaveLength(2);
    const beforeRetry = await harness.db.select().from(pendingMapAccessChanges).orderBy(asc(pendingMapAccessChanges.mapId));
    await acknowledgeMapAccessChanges([], old);
    expect(await harness.db.select().from(pendingMapAccessChanges).orderBy(asc(pendingMapAccessChanges.mapId))).toEqual(beforeRetry);
    await acknowledgeMapAccessChanges(await readPendingMapAccessChanges());
    await expect(readPendingMapAccessChanges()).resolves.toEqual([]);
    await updateAffiliations([affiliation(98000011)], new Date());
    await acknowledgeMapAccessChanges(old);
    expect(await readPendingMapAccessChanges()).toHaveLength(2);
  });

  it('bounds reads and rotates failed maps behind untouched work while acknowledging successes', async () => {
    const seeded = Array.from({ length: MAX_PENDING_BATCH + 1 }, (_, i) => ({ id: mapId(i), userId: USER_ID, name: 'Map' }));
    await harness.db.insert(maps).values(seeded);
    await harness.db.insert(pendingMapAccessChanges).values(
      seeded.map((map) => ({ mapId: map.id, queuedAt: new Date('2026-01-01') })),
    );
    const batch = await readPendingMapAccessChanges();
    expect(batch).toHaveLength(MAX_PENDING_BATCH);
    expect(batch[0]?.mapId).toBe(mapId(0));
    expect(await readPendingMapAccessChanges(1)).toEqual(batch.slice(0, 1));
    await acknowledgeMapAccessChanges(batch.slice(1), batch.slice(0, 1));
    expect((await readPendingMapAccessChanges()).map((row) => row.mapId)).toEqual([mapId(MAX_PENDING_BATCH), mapId(0)]);
    await expect(readPendingMapAccessChanges(MAX_PENDING_BATCH + 1)).rejects.toThrow(RangeError);
    await expect(readPendingMapAccessChanges(0)).rejects.toThrow(RangeError);
    await expect(readPendingMapAccessChanges(1.5)).rejects.toThrow(RangeError);
    await expect(acknowledgeMapAccessChanges(batch, batch.slice(0, 1))).rejects.toThrow(RangeError);
    await acknowledgeMapAccessChanges([]);
  });

  async function seedCharacterMaps(ids: string[]) {
    await harness.db.insert(maps).values(ids.map((id) => ({ id, userId: USER_ID, name: 'Map' })));
    await harness.db.insert(mapAccess).values(ids.map((id) => ({
      mapId: id, ownerType: 'character' as const, ownerId: FIRST_CHAR, role: 'viewer' as const,
    })));
  }

  it('coalesces affected-map enqueues and rotates generations for retry', async () => {
    await seedCharacter(FIRST_CHAR, { corporationId: 98000011 });
    await seedCharacterMaps([mapId(1)]);
    await harness.db.insert(mapAccess).values({ mapId: mapId(1), ownerType: 'corporation', ownerId: 98000011, role: 'viewer' });
    await expect(enqueueAffectedMapAccessChanges(SECOND_CHAR)).resolves.toEqual([]);
    const first = await enqueueAffectedMapAccessChanges(FIRST_CHAR);
    expect(await readPendingMapAccessChanges()).toEqual(first);
    expect(first).toHaveLength(1);
    const second = await enqueueAffectedMapAccessChanges(FIRST_CHAR);
    expect(await readPendingMapAccessChanges()).toEqual(second);
    expect(second).toHaveLength(1);
    expect(second[0]?.version).not.toBe(first[0]?.version);
    await acknowledgeMapAccessChanges(first);
    expect(await readPendingMapAccessChanges()).toEqual(second);
    await acknowledgeMapAccessChanges(second);
    expect(await readPendingMapAccessChanges()).toEqual([]);
  });

  it('enqueues all overflow maps in one producer batch while drain reads stay bounded', async () => {
    await seedCharacterMaps(Array.from({ length: MAX_PENDING_BATCH + 1 }, (_, i) => mapId(i)));
    const captured = await enqueueAffectedMapAccessChanges(FIRST_CHAR);
    expect(captured).toHaveLength(MAX_PENDING_BATCH + 1);
    const drained = await readPendingMapAccessChanges();
    expect(drained).toHaveLength(MAX_PENDING_BATCH);
    await acknowledgeMapAccessChanges(drained);
    expect(await readPendingMapAccessChanges()).toEqual(
      captured.filter((row) => !drained.some((done) => done.mapId === row.mapId)),
    );
  });

  it.each(['older first', 'newer first'] as const)(
    'keeps the newest observation and queues persisted corporation transitions when writers finish %s',
    async (order) => {
      for (const corp of [98000011, 98000021, 98000031]) await seedCorpMap(corp);
      await seedCharacter(FIRST_CHAR, { corporationId: 98000011 });
      const observedAt = new Date();
      const newerObservedAt = new Date(observedAt.getTime() + 1);
      const writeOlder = () => updateAffiliations([affiliation(98000021)], observedAt);
      const writeNewer = () => updateAffiliations([affiliation(98000031)], newerObservedAt);
      if (order === 'older first') {
        expect(await writeOlder()).toEqual({ refreshed: 1, accessChanged: true });
        expect(await writeNewer()).toEqual({ refreshed: 1, accessChanged: true });
      } else {
        expect(await writeNewer()).toEqual({ refreshed: 1, accessChanged: true });
        expect(await writeOlder()).toEqual({ refreshed: 0, accessChanged: false });
      }
      const [stored] = await harness.db.select().from(characters).where(eq(characters.characterId, FIRST_CHAR));
      expect(stored).toMatchObject({ corporationId: 98000031, affiliationRefreshedAt: newerObservedAt });
      const pending = await readPendingMapAccessChanges();
      const expectedMaps = [mapId(98000011), mapId(98000031)];
      if (order === 'older first') expectedMaps.push(mapId(98000021));
      expect(pending.map((row) => row.mapId).sort()).toEqual(expectedMaps.sort());
    },
  );

  it.each(['older first', 'newer first'] as const)(
    'preserves observation ordering and intermediate maps under row-lock contention with %s',
    async (order) => {
      for (const corp of [98000011, 98000021, 98000031]) await seedCorpMap(corp);
      await seedCharacter(FIRST_CHAR, { corporationId: 98000011 });
      const observedAt = new Date();
      const newerObservedAt = new Date(observedAt.getTime() + 1);
      const write = (corporationId: number, stamp: Date) =>
        updateAffiliations([affiliation(corporationId)], stamp).then(
          (value) => ({ status: 'fulfilled' as const, value }),
          (reason: unknown) => ({ status: 'rejected' as const, reason }),
        );
      const writers: ReturnType<typeof write>[] = [];
      const blocker = await harness.sql.reserve();
      try {
        await blocker`BEGIN`;
        await blocker`SET LOCAL idle_in_transaction_session_timeout = '10s'`;
        await blocker`SELECT character_id FROM characters
          WHERE character_id = ${FIRST_CHAR} FOR UPDATE`;
        const [holder] = await blocker<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
        const waitForWriters = async (count: number) => {
          await expect.poll(async () => {
            const [row] = await harness.sql<{ count: number }[]>`
              WITH RECURSIVE blocked(pid) AS (
                SELECT pid FROM pg_stat_activity
                WHERE ${holder!.pid} = ANY(pg_blocking_pids(pid))
                UNION
                SELECT activity.pid FROM pg_stat_activity activity
                JOIN blocked ON blocked.pid = ANY(pg_blocking_pids(activity.pid))
              )
              SELECT count(*)::integer AS count FROM blocked
            `;
            return row?.count;
          }, { timeout: 3_000, interval: 20 }).toBe(count);
        };
        writers.push(order === 'older first'
          ? write(98000021, observedAt) : write(98000031, newerObservedAt));
        await waitForWriters(1);
        writers.push(order === 'older first'
          ? write(98000031, newerObservedAt) : write(98000021, observedAt));
        // Observe actual database contention before releasing the row lock.
        await waitForWriters(2);
      } finally {
        try {
          await blocker`ROLLBACK`;
        } finally {
          blocker.release();
          await Promise.all(writers);
        }
      }
      const persisted = { status: 'fulfilled', value: { refreshed: 1, accessChanged: true } };
      const rejectedStale = { status: 'fulfilled', value: { refreshed: 0, accessChanged: false } };
      await expect(Promise.all(writers)).resolves.toEqual(
        order === 'older first' ? [persisted, persisted] : [persisted, rejectedStale],
      );
      const [stored] = await harness.db.select().from(characters).where(eq(characters.characterId, FIRST_CHAR));
      expect(stored).toMatchObject({ corporationId: 98000031, affiliationRefreshedAt: newerObservedAt });
      const expectedMaps = [mapId(98000011), mapId(98000031)];
      if (order === 'older first') expectedMaps.push(mapId(98000021));
      expect((await readPendingMapAccessChanges()).map((row) => row.mapId).sort()).toEqual(expectedMaps.sort());
    },
    15_000,
  );

  it('captures distinct UTC clocks and rejects later writes that reuse the same observation timestamp', async () => {
    const first = await captureAffiliationObservedAt();
    const second = await captureAffiliationObservedAt();
    expect(first).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{6}$/);
    expect(second > first).toBe(true);

    await seedCorpMap(98000011);
    await seedCorpMap(98000021);
    await seedCharacter(FIRST_CHAR, { corporationId: 98000011 });
    const observedAt = new Date();
    expect(await updateAffiliations([affiliation(98000021)], observedAt)).toEqual({
      refreshed: 1, accessChanged: true,
    });
    const pending = await readPendingMapAccessChanges();
    expect(await updateAffiliations([affiliation(98000011)], observedAt)).toEqual({
      refreshed: 0, accessChanged: false,
    });
    const [stored] = await harness.db.select().from(characters).where(eq(characters.characterId, FIRST_CHAR));
    expect(stored).toMatchObject({ corporationId: 98000021, affiliationRefreshedAt: observedAt });
    await expect(readPendingMapAccessChanges()).resolves.toEqual(pending);
  });

  it('removes pending work when its map is deleted', async () => {
    await seedCorpMap(98000011);
    await seedCharacter(FIRST_CHAR);
    await updateAffiliations([affiliation(98000011)], new Date());
    await harness.db.delete(maps).where(eq(maps.id, mapId(98000011)));
    await expect(readPendingMapAccessChanges()).resolves.toEqual([]);
  });

  it('records the complete allow and deny decision provenance', async () => {
    await recordCorpAccessDecision({
      userId: USER_ID,
      corporationId: 98000031,
      characterId: FIRST_CHAR,
      allowed: true,
      reason: 'member',
    });
    await recordCorpAccessDecision({
      userId: USER_ID,
      corporationId: 98000031,
      characterId: null,
      allowed: false,
      reason: 'no_current_member',
    });

    const rows = await harness.db
      .select()
      .from(corpAccessAudit)
      .where(eq(corpAccessAudit.userId, USER_ID))
      .orderBy(asc(corpAccessAudit.id));
    expect(rows).toHaveLength(2);
    expect(rows.map(({ allowed, characterId, corporationId, reason }) => ({
      allowed,
      characterId,
      corporationId,
      reason,
    }))).toEqual([
      {
        allowed: true,
        characterId: FIRST_CHAR,
        corporationId: 98000031,
        reason: 'member',
      },
      {
        allowed: false,
        characterId: null,
        corporationId: 98000031,
        reason: 'no_current_member',
      },
    ]);
  });
});
