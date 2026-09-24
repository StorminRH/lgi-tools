import { expect, test, vi } from 'vitest';
import { deleteMapForUser, restoreMapForUser } from './map-lifecycle';

const mocks = vi.hoisted(() => ({
  getMapAccessSubject: vi.fn(),
  getMapGrants: vi.fn(),
  reserveMapAccessProjectionRevision: vi.fn(),
  getMapAccessCandidateUserIds: vi.fn(),
  getUsersAffiliations: vi.fn(),
  refreshAffiliationsWithOutcome: vi.fn(),
  fetchWithTimeout: vi.fn(),
  deriveConvexSiteUrl: vi.fn(),
  readEnv: vi.fn(),
}));

vi.mock('@/data/maps/queries', () => ({
  getMapAccessSubject: mocks.getMapAccessSubject,
  getMapGrants: mocks.getMapGrants,
  reserveMapAccessProjectionRevision: mocks.reserveMapAccessProjectionRevision,
  getMapAccessCandidateUserIds: mocks.getMapAccessCandidateUserIds,
}));
vi.mock('@/platform/auth/affiliation-store', () => ({
  getUsersAffiliations: mocks.getUsersAffiliations,
}));
vi.mock('@/platform/auth/affiliation', () => ({
  refreshAffiliationsWithOutcome: mocks.refreshAffiliationsWithOutcome,
}));
vi.mock('@/lib/fetch-with-timeout', () => ({
  fetchWithTimeout: mocks.fetchWithTimeout,
  OUTBOUND_FETCH_TIMEOUT_MS: 10_000,
}));
vi.mock('@/lib/sync-engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/sync-engine')>();
  return { ...actual, deriveConvexSiteUrl: mocks.deriveConvexSiteUrl };
});
vi.mock('@/lib/env', () => ({ readEnv: mocks.readEnv }));

import {
  computeMapAccessClaims,
  projectMapAccess,
  projectStagedMapAccess,
  ProjectionUnavailableError,
  requireCurrentProjection,
  purgeUserMapAccessProjection,
  revokeUserMapClaims,
  teardownMapAccessProjection,
} from './map-access-projection';

function affiliation(userId: string, characterId: number, corporationId: number | null, fresh = true) {
  return {
    userId, characterId, corporationId, allianceId: null, factionId: null,
    refreshedAt: fresh ? new Date() : new Date(Date.now() - 2 * 60 * 60 * 1000),
  };
}

function resetProjectionMocks() {
  vi.resetAllMocks();
  mocks.refreshAffiliationsWithOutcome.mockRejectedValue(new Error('ESI unavailable'));
  mocks.getUsersAffiliations.mockResolvedValue([]);
  mocks.getMapAccessSubject.mockResolvedValue({ userId: 'creator', archivedAt: null });
  mocks.getMapGrants.mockResolvedValue([]);
  mocks.reserveMapAccessProjectionRevision.mockResolvedValue(41);
  mocks.getMapAccessCandidateUserIds.mockResolvedValue([]);
  mocks.deriveConvexSiteUrl.mockReturnValue('http://127.0.0.1:3211');
  mocks.readEnv.mockImplementation((name: string) =>
    name === 'CONVEX_SERVICE_SECRET' ? 'svc-secret' : undefined,
  );
  vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', 'http://127.0.0.1:3210');
}

test('delivers all batches and stops before unlink when a batch fails', async () => {
  resetProjectionMocks();
  const ids = Array.from({ length: 65 }, (_, index) => `map-${index}`);
  mocks.fetchWithTimeout.mockResolvedValueOnce(Response.json({ deleted: 32 }))
    .mockResolvedValueOnce(Response.json({ deleted: 32 }))
    .mockRejectedValueOnce(new Error('Convex unavailable'));

  await expect(revokeUserMapClaims('departing', ids)).rejects.toBeInstanceOf(
    ProjectionUnavailableError,
  );
  const calls = mocks.fetchWithTimeout.mock.calls;
  expect(calls).toHaveLength(3);
  expect(calls.map(([url]) => url)).toEqual(
    Array(3).fill('http://127.0.0.1:3211/purge-user-map-claims'),
  );
  expect(calls.map(([, init]) => JSON.parse((init as { body: string }).body).mapIds))
    .toEqual([ids.slice(0, 32), ids.slice(32, 64), ids.slice(64)]);
});

test('computes creator-only, batched union, unlinked, and missing-or-archived claim sets', async () => {
  resetProjectionMocks();
  await expect(computeMapAccessClaims('map-1')).resolves.toEqual([
    { userId: 'creator', roles: ['admin'] },
  ]);

  mocks.getMapAccessCandidateUserIds.mockClear();
  mocks.getUsersAffiliations.mockClear();
  mocks.getMapGrants.mockResolvedValue([
    { ownerType: 'character', ownerId: 42, role: 'viewer' },
    { ownerType: 'corporation', ownerId: 990, role: 'editor' },
  ]);
  mocks.getMapAccessCandidateUserIds.mockResolvedValue(['multi', 'member', 'creator']);
  mocks.getUsersAffiliations.mockResolvedValue([
    affiliation('multi', 42, 990), affiliation('member', 43, 990),
  ]);

  await expect(computeMapAccessClaims('map-1')).resolves.toEqual([
    { userId: 'creator', roles: ['admin'] },
    { userId: 'member', roles: ['editor'] },
    { userId: 'multi', roles: ['editor', 'viewer'] },
  ]);
  expect(mocks.getMapAccessCandidateUserIds).toHaveBeenCalledExactlyOnceWith([42], [990]);
  expect(mocks.getUsersAffiliations).toHaveBeenCalledExactlyOnceWith(['multi', 'member']);
  expect(mocks.refreshAffiliationsWithOutcome).not.toHaveBeenCalled();

  mocks.getMapGrants.mockResolvedValue([
    { ownerType: 'character', ownerId: 42, role: 'viewer' },
  ]);
  mocks.getMapAccessCandidateUserIds.mockResolvedValue(['unlinked']);
  mocks.getUsersAffiliations.mockResolvedValue([]);
  await expect(computeMapAccessClaims('map-1')).resolves.toEqual([
    { userId: 'creator', roles: ['admin'] },
  ]);

  mocks.getMapGrants.mockClear();
  mocks.getUsersAffiliations.mockClear();
  mocks.getMapAccessSubject.mockResolvedValue(null);
  await expect(computeMapAccessClaims('missing')).resolves.toEqual([]);
  mocks.getMapAccessSubject.mockResolvedValue({ userId: 'creator', archivedAt: new Date() });
  await expect(computeMapAccessClaims('map-1')).resolves.toEqual([]);
  expect(mocks.getMapGrants).not.toHaveBeenCalled();
  expect(mocks.getUsersAffiliations).not.toHaveBeenCalled();
});

test('excludes stale corp memberships, keeps remaining alt grants, and revokes known departures when ESI is down', async () => {
  resetProjectionMocks();
  mocks.getMapGrants.mockResolvedValue([
    { ownerType: 'character', ownerId: 42, role: 'viewer' },
    { ownerType: 'corporation', ownerId: 990, role: 'editor' },
  ]);
  mocks.getMapAccessCandidateUserIds.mockResolvedValue(['direct', 'stale-member']);
  mocks.getUsersAffiliations.mockResolvedValue([
    affiliation('creator', 41, 990, false),
    affiliation('direct', 42, 990, false),
    affiliation('stale-member', 43, 990, false),
  ]);
  await expect(computeMapAccessClaims('map-1')).resolves.toEqual([
    { userId: 'creator', roles: ['admin'] }, { userId: 'direct', roles: ['viewer'] },
  ]);

  mocks.getMapGrants.mockResolvedValue([
    { ownerType: 'corporation', ownerId: 990, role: 'editor' },
    { ownerType: 'corporation', ownerId: 992, role: 'viewer' },
  ]);
  mocks.getMapAccessCandidateUserIds.mockResolvedValue(['member']);
  mocks.getUsersAffiliations.mockResolvedValue([
    affiliation('member', 42, 991), affiliation('member', 43, 992),
  ]);
  await expect(computeMapAccessClaims('map-1')).resolves.toEqual([
    { userId: 'creator', roles: ['admin'] }, { userId: 'member', roles: ['viewer'] },
  ]);

  mocks.getMapGrants.mockResolvedValue([
    { ownerType: 'corporation', ownerId: 990, role: 'editor' },
  ]);
  mocks.getMapAccessCandidateUserIds.mockResolvedValue(['departed']);
  mocks.getUsersAffiliations.mockResolvedValue([affiliation('departed', 42, 991)]);
  mocks.fetchWithTimeout.mockResolvedValue(Response.json({
    inserted: 0, updated: 0, deleted: 1, unchanged: 1, outcome: 'applied',
  }));

  await expect(projectMapAccess('map-1')).resolves.toMatchObject({ deleted: 1 });
  const request = mocks.fetchWithTimeout.mock.calls[0]?.[1] as { body: string };
  expect(JSON.parse(request.body).claims).toEqual([{ userId: 'creator', roles: ['admin'] }]);
  expect(mocks.refreshAffiliationsWithOutcome).not.toHaveBeenCalled();
});

test('posts computed claims, refuses door/env/stale/purge failures, and does not deliver after cancellation', async () => {
  resetProjectionMocks();
  mocks.fetchWithTimeout.mockResolvedValue(
    new Response(
      JSON.stringify({
        inserted: 1,
        updated: 0,
        deleted: 0,
        unchanged: 0,
        outcome: 'applied',
      }),
      { status: 200 },
    ),
  );

  await expect(projectMapAccess('map-1')).resolves.toEqual({
    inserted: 1,
    updated: 0,
    deleted: 0,
    unchanged: 0,
    outcome: 'applied',
  });
  expect(mocks.reserveMapAccessProjectionRevision.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.getMapAccessSubject.mock.invocationCallOrder[0]!,
  );
  expect(mocks.reserveMapAccessProjectionRevision.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.fetchWithTimeout.mock.invocationCallOrder[0]!,
  );
  expect(mocks.fetchWithTimeout).toHaveBeenCalledWith(
    'http://127.0.0.1:3211/project-map-access',
    expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        authorization: 'Bearer svc-secret',
      }),
      body: JSON.stringify({
        mapId: 'map-1',
        revision: 41,
        claims: [{ userId: 'creator', roles: ['admin'] }],
      }),
    }),
  );

  mocks.fetchWithTimeout.mockResolvedValue(new Response('nope', { status: 503 }));
  await expect(projectMapAccess('map-1')).rejects.toBeInstanceOf(ProjectionUnavailableError);

  vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', '');
  mocks.readEnv.mockReturnValue(undefined);
  await expect(projectMapAccess('map-1')).rejects.toBeInstanceOf(ProjectionUnavailableError);
  mocks.readEnv.mockImplementation((name: string) =>
    name === 'CONVEX_SERVICE_SECRET' ? 'svc-secret' : undefined,
  );
  vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', 'http://127.0.0.1:3210');

  mocks.fetchWithTimeout.mockResolvedValue(
    Response.json({
      inserted: 0,
      updated: 0,
      deleted: 0,
      unchanged: 0,
      outcome: 'stale',
    }),
  );
  await expect(teardownMapAccessProjection('map-1')).rejects.toBeInstanceOf(
    ProjectionUnavailableError,
  );

  mocks.fetchWithTimeout.mockResolvedValue(Response.json({ deleted: 'nope' }));
  await expect(purgeUserMapAccessProjection('user-1')).rejects.toBeInstanceOf(
    ProjectionUnavailableError,
  );

  resetProjectionMocks();
  let releaseSubject: ((value: { userId: string; archivedAt: null }) => void) | undefined;
  mocks.getMapAccessSubject.mockReturnValue(
    new Promise((resolve) => {
      releaseSubject = resolve;
    }),
  );
  const controller = new AbortController();
  const projection = projectMapAccess('map-1', { signal: controller.signal });

  controller.abort(new DOMException('timed out', 'TimeoutError'));
  releaseSubject?.({ userId: 'creator', archivedAt: null });

  await expect(projection).rejects.toBeInstanceOf(ProjectionUnavailableError);
  expect(mocks.fetchWithTimeout).not.toHaveBeenCalled();
});

test('ordinary reprojection empties archived maps; the creation seam still projects the hidden staging row', async () => {
  resetProjectionMocks();
  mocks.getMapAccessSubject.mockResolvedValue({
    userId: 'creator',
    archivedAt: new Date('2026-08-12T00:00:00.000Z'),
  });
  mocks.fetchWithTimeout.mockResolvedValue(
    Response.json({
      inserted: 0,
      updated: 0,
      deleted: 1,
      unchanged: 0,
      outcome: 'applied',
    }),
  );

  await projectMapAccess('map-1');

  expect(mocks.fetchWithTimeout).toHaveBeenCalledWith(
    'http://127.0.0.1:3211/project-map-access',
    expect.objectContaining({
      body: JSON.stringify({ mapId: 'map-1', revision: 41, claims: [] }),
    }),
  );

  mocks.fetchWithTimeout.mockResolvedValue(
    Response.json({
      inserted: 1,
      updated: 0,
      deleted: 0,
      unchanged: 0,
      outcome: 'applied',
    }),
  );

  await projectStagedMapAccess('map-1');

  expect(mocks.fetchWithTimeout).toHaveBeenCalledWith(
    'http://127.0.0.1:3211/project-map-access',
    expect.objectContaining({
      body: JSON.stringify({
        mapId: 'map-1',
        revision: 41,
        claims: [{ userId: 'creator', roles: ['admin'] }],
      }),
    }),
  );
});

test('requireCurrentProjection throws when a newer projection already won', () => {
  try {
    requireCurrentProjection({
      inserted: 0,
      updated: 0,
      deleted: 0,
      unchanged: 0,
      outcome: 'stale',
    });
    expect.unreachable('expected stale projection to throw');
  } catch (error) {
    expect(error).toBeInstanceOf(ProjectionUnavailableError);
    expect(error).toEqual(
      expect.objectContaining({ message: expect.stringMatching(/newer projection already won/) }),
    );
  }
});

test('a delayed archive preserves access after restore has projected and acknowledged its generation', async () => {
  resetProjectionMocks();
  let archived = false;
  let version: string | null = null;
  let revision = 0;
  let claims: unknown = [];
  const archiveCommitted = Promise.withResolvers<void>();
  const releaseArchive = Promise.withResolvers<void>();
  mocks.getMapAccessSubject.mockImplementation(async () => ({
    userId: 'creator', archivedAt: archived ? new Date() : null,
  }));
  mocks.reserveMapAccessProjectionRevision.mockImplementation(async () => ++revision);
  mocks.fetchWithTimeout.mockImplementation(async (_url, init: { body: string }) => {
    claims = JSON.parse(init.body).claims;
    return Response.json({ inserted: 0, updated: 0, deleted: 0, unchanged: 0, outcome: 'applied' });
  });
  const common = {
    resolvePrincipals: async () => ({ characterIds: [], corporationIds: [] }),
    acknowledgeAccess: async (changes: { mapId: string; version: string }[]) => {
      if (changes.some((change) => change.version === version)) version = null;
    },
  };
  const archive = deleteMapForUser('creator', { mapId: 'map-1' }, {
    ...common,
    archiveMap: async () => {
      archived = true;
      version = 'archive';
      archiveCommitted.resolve();
      await releaseArchive.promise;
      return { mapId: 'map-1', version: 'archive' };
    },
  });
  await archiveCommitted.promise;
  await restoreMapForUser('creator', { mapId: 'map-1' }, {
    ...common,
    restoreMap: async () => {
      archived = false;
      version = 'restore';
      return { mapId: 'map-1', version: 'restore' };
    },
  });
  expect(version).toBeNull();
  expect(claims).toEqual([{ userId: 'creator', roles: ['admin'] }]);
  releaseArchive.resolve();
  await archive;
  expect(archived).toBe(false);
  expect(version).toBeNull();
  expect(claims).toEqual([{ userId: 'creator', roles: ['admin'] }]);
});
