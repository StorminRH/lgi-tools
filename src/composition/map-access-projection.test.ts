import { beforeEach, describe, expect, it, vi } from 'vitest';

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

beforeEach(() => {
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
});

describe('revokeUserMapClaims', () => {
  it('delivers all batches and stops before unlink when a batch fails', async () => {
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
});

describe('computeMapAccessClaims', () => {
  it('returns a creator-only admin claim for a map with no grants', async () => {
    await expect(computeMapAccessClaims('map-1')).resolves.toEqual([
      { userId: 'creator', roles: ['admin'] },
    ]);
  });

  it('reads every candidate affiliation once in a batch and unions matching roles', async () => {
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
  });

  it('revokes known departures despite an unavailable ESI refresh', async () => {
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

  it('preserves a remaining alt corporation grant after a departure', async () => {
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
  });

  it('excludes stale memberships while preserving linked character and creator grants', async () => {
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
  });

  it('removes direct access if a character was unlinked after candidate discovery', async () => {
    mocks.getMapGrants.mockResolvedValue([
      { ownerType: 'character', ownerId: 42, role: 'viewer' },
    ]);
    mocks.getMapAccessCandidateUserIds.mockResolvedValue(['unlinked']);
    await expect(computeMapAccessClaims('map-1')).resolves.toEqual([
      { userId: 'creator', roles: ['admin'] },
    ]);
  });

  it('returns no claims or affiliation reads for a missing or archived map', async () => {
    mocks.getMapAccessSubject.mockResolvedValue(null);
    await expect(computeMapAccessClaims('missing')).resolves.toEqual([]);
    mocks.getMapAccessSubject.mockResolvedValue({ userId: 'creator', archivedAt: new Date() });
    await expect(computeMapAccessClaims('map-1')).resolves.toEqual([]);
    expect(mocks.getMapGrants).not.toHaveBeenCalled();
    expect(mocks.getUsersAffiliations).not.toHaveBeenCalled();
  });
});

describe('projectMapAccess transport', () => {
  it('posts the computed claim set and returns reconcile counts', async () => {
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
  });

  it('throws when the door, env, stale teardown, or drifted purge cannot apply', async () => {
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
  });

  it('reconciles archived maps to an empty claim set during ordinary reprojection', async () => {
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
  });

  it('projects the hidden archived staging row only through the creation seam', async () => {
    mocks.getMapAccessSubject.mockResolvedValue({
      userId: 'creator',
      archivedAt: new Date('2026-08-12T00:00:00.000Z'),
    });
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

  it('does not deliver claims when computation finishes after cancellation', async () => {
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
});

describe('requireCurrentProjection', () => {
  const counts = {
    inserted: 0,
    updated: 0,
    deleted: 0,
    unchanged: 0,
  };

  it('returns applied and duplicate results', () => {
    expect(requireCurrentProjection({ ...counts, outcome: 'applied' })).toEqual({
      ...counts,
      outcome: 'applied',
    });
    expect(requireCurrentProjection({ ...counts, outcome: 'duplicate' })).toEqual({
      ...counts,
      outcome: 'duplicate',
    });
  });

  it('throws when a newer projection already won', () => {
    try {
      requireCurrentProjection({ ...counts, outcome: 'stale' });
      expect.unreachable('expected stale projection to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ProjectionUnavailableError);
      expect(error).toEqual(
        expect.objectContaining({ message: expect.stringMatching(/newer projection already won/) }),
      );
    }
  });
});
