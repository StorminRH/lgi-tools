import { asc } from 'drizzle-orm';
import { drizzle as drizzlePg } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { esiSnapshots } from '@/data/esi-snapshots/schema';
import { ownedAssets } from '@/features/owned-assets/schema';
import {
  canReachDb,
  dropDisposableSchema,
  LOCAL_DB_URL,
  schemaUrl,
  setupDisposableSchema,
} from './test-support/db-coverage-harness';
import { pruneEsiSnapshots } from './esi-snapshot-retention';

const SCHEMA = 'test_esi_snapshot_retention';
const baseUrl = process.env.DATABASE_URL ?? LOCAL_DB_URL;
const reachable = await canReachDb(baseUrl);
const NOW = new Date('2026-07-14T12:00:00Z');
const OLD = new Date('2026-07-01T12:00:00Z');
const BOUNDARY = new Date('2026-07-07T12:00:00Z');
const NEW = new Date('2026-07-14T11:00:00Z');

function snapshot(id: number, ownerId: number, fetchedAt: Date) {
  return {
    id,
    ownerType: 'corporation' as const,
    ownerId,
    endpoint: `/corporations/${ownerId}/assets/`,
    requestHash: `hash-${id}`,
    etag: `"${id}"`,
    responseHeaders: [],
    fetchedAt,
    sourceVersion: '2025-08-26',
    bodyCiphertext: 'v1:iv:tag:ciphertext',
  };
}

describe.skipIf(!reachable)('ESI snapshot retention executes against Postgres', () => {
  let client: ReturnType<typeof postgres>;

  beforeAll(async () => {
    client = postgres(schemaUrl(baseUrl, SCHEMA), { max: 1, onnotice: () => {} });
    await setupDisposableSchema(client, SCHEMA, ['esi_snapshots', 'owned_assets']);
  });

  afterAll(async () => {
    await dropDisposableSchema(client, SCHEMA);
    await client.end({ timeout: 5 }).catch(() => {});
  });

  it('prunes expired superseded snapshots but preserves the boundary, latest, and referenced', async () => {
    const database = drizzlePg(client);
    await database.insert(esiSnapshots).values([
      snapshot(1, 100, OLD),
      snapshot(2, 100, NEW),
      snapshot(3, 200, OLD),
      snapshot(4, 200, NEW),
      snapshot(5, 300, OLD),
      snapshot(6, 400, BOUNDARY),
    ]);
    await database.insert(ownedAssets).values({
      ownerType: 'corporation',
      ownerId: 200,
      typeId: 34,
      quantity: 1,
      locationId: 60003760,
      locationFlag: 'CorpSAG1',
      locationType: 'station',
      snapshotId: 3,
    });

    await pruneEsiSnapshots(database, 7, NOW);

    const remaining = await database
      .select({ id: esiSnapshots.id })
      .from(esiSnapshots)
      .orderBy(asc(esiSnapshots.id));
    expect(remaining).toEqual([{ id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }, { id: 6 }]);
  });
});
