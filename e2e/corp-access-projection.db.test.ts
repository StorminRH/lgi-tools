import { convexTest } from 'convex-test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reconcileAffiliationAccess } from '@/composition/map-affiliation-access';
import { projectMapAccess } from '@/composition/map-access-projection';
import { mapAccess, maps } from '@/data/maps/schema';
import {
  createDbTestHarness,
  seedCharacter,
  seedEveAccount,
  seedUser,
} from '@/db/__tests__/support/db-test-harness';
import {
  readPendingMapAccessChanges,
  updateAffiliations,
} from '@/platform/auth/affiliation-store';
import { api } from '../convex/_generated/api';
import { modules } from '../convex/__tests__/modules.setup';
import schema from '../convex/schema';

vi.mock('@/platform/auth/affiliation', () => ({
  refreshAffiliationsWithOutcome: vi.fn(() => {
    throw new Error('Projection must not call ESI');
  }),
}));

const harness = await createDbTestHarness({
  schema: 'test_corp_access_projection_pipeline',
  tables: ['user', 'account', 'characters', 'maps', 'map_access', 'map_access_changes'],
  foreignKeys: [
    { table: 'account', column: 'user_id', refTable: 'user', refColumn: 'id', onDelete: 'cascade' },
    { table: 'maps', column: 'user_id', refTable: 'user', refColumn: 'id', onDelete: 'cascade' },
    { table: 'map_access', column: 'map_id', refTable: 'maps', refColumn: 'id', onDelete: 'cascade' },
    { table: 'map_access_changes', column: 'map_id', refTable: 'maps', refColumn: 'id', onDelete: 'cascade' },
  ],
  steerDbProxy: true,
  resetBetweenTests: 'truncate',
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe.skipIf(!harness.reachable)('corporation revocation from Postgres to Convex', () => {
  it('retries failed delivery and revokes a departed member without losing direct character access', async () => {
    await seedUser(harness.db, 'creator');
    await seedUser(harness.db, 'member');
    await seedUser(harness.db, 'direct');
    await seedCharacter(harness.db, 42, {
      corporationId: 990,
      affiliationRefreshedAt: new Date(),
    });
    await seedCharacter(harness.db, 43, {
      corporationId: 990,
      affiliationRefreshedAt: new Date(0),
    });
    await seedEveAccount(harness.db, { id: 'member-account', characterId: 42, userId: 'member' });
    await seedEveAccount(harness.db, { id: 'direct-account', characterId: 43, userId: 'direct' });
    const mapId = '12345678-0000-4000-8000-123456789000';
    await harness.db.insert(maps).values({ id: mapId, userId: 'creator', name: 'Pipeline' });
    await harness.db.insert(mapAccess).values([
      { mapId, ownerType: 'corporation', ownerId: 990, role: 'viewer' },
      { mapId, ownerType: 'character', ownerId: 43, role: 'editor' },
    ]);

    const t = convexTest(schema, modules);
    vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', 'https://pipeline.convex.cloud');
    vi.stubEnv('CONVEX_SERVICE_SECRET', 'test-pipeline-secret');
    // Replace only network transport; execute the actual Convex HTTP handler and mutations.
    const deliver: typeof fetch = async (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      return t.fetch(new URL(url).pathname, init);
    };
    vi.stubGlobal('fetch', vi.fn(deliver));
    await projectMapAccess(mapId);
    const gate = (userId: string) => t.withIdentity({ subject: userId })
      .query(api.mapChainAccess.watchMapAccess, { mapId });
    expect(await gate('member')).toEqual({ granted: true, canEdit: false });
    expect(await gate('direct')).toEqual({ granted: true, canEdit: true });

    expect(await updateAffiliations([
      { characterId: 42, corporationId: 991, allianceId: null, factionId: null },
    ])).toEqual({ refreshed: 1, accessChanged: true });
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('Temporary delivery outage');
    }));
    expect(await reconcileAffiliationAccess()).toEqual({ processed: 0, failed: 1 });
    expect(await readPendingMapAccessChanges()).toHaveLength(1);

    // The affiliation is already fresh: durable work must survive until delivery succeeds.
    vi.stubGlobal('fetch', vi.fn(deliver));
    expect(await reconcileAffiliationAccess()).toEqual({ processed: 1, failed: 0 });
    expect(await readPendingMapAccessChanges()).toEqual([]);
    expect(await gate('member')).toEqual({ granted: false, canEdit: false });
    expect(await gate('direct')).toEqual({ granted: true, canEdit: true });
    expect(await gate('creator')).toEqual({ granted: true, canEdit: true });
  });
});
