import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CachedAffiliation } from '@/platform/auth/membership';

const mocks = vi.hoisted(() => ({
  getMapAccessSubject: vi.fn(),
  getMapGrants: vi.fn(),
  reserveMapAccessProjectionRevision: vi.fn(),
  getUserIdsOwningCharacters: vi.fn(),
  getUserIdsInCorporations: vi.fn(),
  getUserAffiliations: vi.fn(),
  listStaleLinkedCharacterIds: vi.fn(),
  refreshAffiliationsWithOutcome: vi.fn(),
  refreshStaleAffiliationsForUserWithOutcome: vi.fn(),
  fetchWithTimeout: vi.fn(),
  deriveConvexSiteUrl: vi.fn(),
  readEnv: vi.fn(),
}));

vi.mock('@/data/maps/queries', () => ({
  getMapAccessSubject: mocks.getMapAccessSubject,
  getMapGrants: mocks.getMapGrants,
  reserveMapAccessProjectionRevision: mocks.reserveMapAccessProjectionRevision,
  getUserIdsOwningCharacters: mocks.getUserIdsOwningCharacters,
  getUserIdsInCorporations: mocks.getUserIdsInCorporations,
}));
vi.mock('@/platform/auth/affiliation-store', () => ({
  getUserAffiliations: mocks.getUserAffiliations,
  listStaleLinkedCharacterIds: mocks.listStaleLinkedCharacterIds,
}));
vi.mock('@/platform/auth/affiliation', () => ({
  refreshAffiliationsWithOutcome: mocks.refreshAffiliationsWithOutcome,
  refreshStaleAffiliationsForUserWithOutcome: mocks.refreshStaleAffiliationsForUserWithOutcome,
}));
vi.mock('@/lib/fetch-with-timeout', () => ({
  fetchWithTimeout: mocks.fetchWithTimeout,
  OUTBOUND_FETCH_TIMEOUT_MS: 10_000,
}));
vi.mock('@/lib/sync-engine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/sync-engine')>();
  return {
    ...actual,
    deriveConvexSiteUrl: mocks.deriveConvexSiteUrl,
  };
});
vi.mock('@/lib/env', () => ({
  readEnv: mocks.readEnv,
}));

import {
  computeMapAccessClaims,
  projectMapAccess,
  projectStagedMapAccess,
  ProjectionUnavailableError,
  requireCurrentProjection,
  purgeUserMapAccessProjection,
  teardownMapAccessProjection,
} from './map-access-projection';

function affiliation(
  characterId: number,
  corporationId: number,
  refreshedAt: Date | null,
): CachedAffiliation {
  return {
    characterId,
    corporationId,
    allianceId: null,
    factionId: null,
    refreshedAt,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.refreshStaleAffiliationsForUserWithOutcome.mockResolvedValue({
    refreshed: 0,
    transientFailure: false,
  });
  mocks.refreshAffiliationsWithOutcome.mockResolvedValue({
    refreshed: 0,
    transientFailure: false,
  });
  mocks.listStaleLinkedCharacterIds.mockResolvedValue([]);
  mocks.getUserAffiliations.mockResolvedValue([]);
  mocks.getMapAccessSubject.mockResolvedValue({
    userId: 'creator',
    archivedAt: null,
  });
  mocks.getMapGrants.mockResolvedValue([]);
  mocks.reserveMapAccessProjectionRevision.mockResolvedValue(41);
  mocks.getUserIdsOwningCharacters.mockResolvedValue(new Map());
  mocks.getUserIdsInCorporations.mockResolvedValue(new Set());
  mocks.deriveConvexSiteUrl.mockReturnValue('http://127.0.0.1:3211');
  mocks.readEnv.mockImplementation((name: string) =>
    name === 'CONVEX_SERVICE_SECRET' ? 'svc-secret' : undefined,
  );
  vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', 'http://127.0.0.1:3210');
});

describe('computeMapAccessClaims', () => {
  it('returns a creator-only admin claim for a map with no grants', async () => {
    await expect(computeMapAccessClaims('map-1')).resolves.toEqual([
      { userId: 'creator', roles: ['admin'] },
    ]);
  });

  it('includes a character-grant owner with the matched role', async () => {
    mocks.getMapGrants.mockResolvedValue([
      { ownerType: 'character', ownerId: 42, role: 'editor' },
    ]);
    mocks.getUserIdsOwningCharacters.mockResolvedValue(new Map([[42, 'grantee']]));
    mocks.getUserAffiliations.mockImplementation(async (userId: string) => {
      if (userId === 'grantee') return [affiliation(42, 99, new Date())];
      return [];
    });

    await expect(computeMapAccessClaims('map-1')).resolves.toEqual([
      { userId: 'creator', roles: ['admin'] },
      { userId: 'grantee', roles: ['editor'] },
    ]);
  });

  it('includes corp-grant members with correct roles', async () => {
    mocks.getMapGrants.mockResolvedValue([
      { ownerType: 'corporation', ownerId: 990, role: 'viewer' },
    ]);
    mocks.getUserIdsInCorporations.mockResolvedValue(new Set(['member']));
    mocks.getUserAffiliations.mockImplementation(async (userId: string) => {
      if (userId === 'member') return [affiliation(42, 990, new Date())];
      return [];
    });

    await expect(computeMapAccessClaims('map-1')).resolves.toEqual([
      { userId: 'creator', roles: ['admin'] },
      { userId: 'member', roles: ['viewer'] },
    ]);
    expect(mocks.listStaleLinkedCharacterIds).toHaveBeenCalledOnce();
    expect(mocks.refreshAffiliationsWithOutcome).toHaveBeenCalledWith([]);
  });

  it('refreshes stale linked affiliations before corp candidate discovery', async () => {
    mocks.getMapGrants.mockResolvedValue([
      { ownerType: 'corporation', ownerId: 990, role: 'viewer' },
    ]);
    mocks.listStaleLinkedCharacterIds.mockResolvedValue([77]);
    mocks.refreshAffiliationsWithOutcome.mockImplementation(async () => {
      mocks.getUserIdsInCorporations.mockResolvedValue(new Set(['joined']));
      return { refreshed: 1, transientFailure: false };
    });
    mocks.getUserAffiliations.mockImplementation(async (userId: string) => {
      if (userId === 'joined') return [affiliation(77, 990, new Date())];
      return [];
    });

    await expect(computeMapAccessClaims('map-1')).resolves.toEqual([
      { userId: 'creator', roles: ['admin'] },
      { userId: 'joined', roles: ['viewer'] },
    ]);
    expect(mocks.refreshAffiliationsWithOutcome).toHaveBeenCalledWith([77]);
    expect(mocks.getUserIdsInCorporations).toHaveBeenCalledWith([990]);
  });

  it('throws when corp-candidate discovery refresh fails transiently', async () => {
    mocks.getMapGrants.mockResolvedValue([
      { ownerType: 'corporation', ownerId: 990, role: 'viewer' },
    ]);
    mocks.listStaleLinkedCharacterIds.mockResolvedValue([77]);
    mocks.refreshAffiliationsWithOutcome.mockResolvedValue({
      refreshed: 0,
      transientFailure: true,
    });

    await expect(computeMapAccessClaims('map-1')).rejects.toBeInstanceOf(
      ProjectionUnavailableError,
    );
    expect(mocks.getUserIdsInCorporations).not.toHaveBeenCalled();
  });

  it('unions roles when a user matches through both principal kinds', async () => {
    mocks.getMapGrants.mockResolvedValue([
      { ownerType: 'character', ownerId: 42, role: 'viewer' },
      { ownerType: 'corporation', ownerId: 990, role: 'editor' },
    ]);
    mocks.getUserIdsOwningCharacters.mockResolvedValue(new Map([[42, 'multi']]));
    mocks.getUserIdsInCorporations.mockResolvedValue(new Set(['multi']));
    mocks.getUserAffiliations.mockResolvedValue([affiliation(42, 990, new Date())]);

    await expect(computeMapAccessClaims('map-1')).resolves.toEqual([
      { userId: 'creator', roles: ['admin'] },
      { userId: 'multi', roles: ['editor', 'viewer'] },
    ]);
  });

  it('omits a corp grant with no current members', async () => {
    mocks.getMapGrants.mockResolvedValue([
      { ownerType: 'corporation', ownerId: 990, role: 'viewer' },
    ]);
    mocks.getUserIdsInCorporations.mockResolvedValue(new Set());

    await expect(computeMapAccessClaims('map-1')).resolves.toEqual([
      { userId: 'creator', roles: ['admin'] },
    ]);
  });

  it('returns an empty set for a missing or archived map', async () => {
    mocks.getMapAccessSubject.mockResolvedValue(null);
    await expect(computeMapAccessClaims('missing')).resolves.toEqual([]);

    mocks.getMapAccessSubject.mockResolvedValue({
      userId: 'creator',
      archivedAt: new Date('2026-08-12T00:00:00.000Z'),
    });
    await expect(computeMapAccessClaims('map-1')).resolves.toEqual([]);
    expect(mocks.getMapGrants).not.toHaveBeenCalled();
  });

  it('converges when a completed refresh leaves a biomassed character stale (404 omissions)', async () => {
    mocks.getMapGrants.mockResolvedValue([
      { ownerType: 'corporation', ownerId: 990, role: 'viewer' },
    ]);
    mocks.getUserIdsInCorporations.mockResolvedValue(new Set(['stale-member']));
    mocks.refreshStaleAffiliationsForUserWithOutcome.mockResolvedValue({
      refreshed: 0,
      transientFailure: false,
    });
    mocks.getUserAffiliations.mockImplementation(async (userId: string) => {
      if (userId === 'stale-member') {
        return [affiliation(42, 990, new Date(Date.now() - 2 * 60 * 60 * 1000))];
      }
      return [];
    });

    await expect(computeMapAccessClaims('map-1')).resolves.toEqual([
      { userId: 'creator', roles: ['admin'] },
    ]);
  });

  it('throws ProjectionUnavailableError when affiliation refresh fails transiently', async () => {
    mocks.getMapGrants.mockResolvedValue([
      { ownerType: 'character', ownerId: 42, role: 'viewer' },
    ]);
    mocks.getUserIdsOwningCharacters.mockResolvedValue(new Map([[42, 'transient']]));
    mocks.refreshStaleAffiliationsForUserWithOutcome.mockResolvedValue({
      refreshed: 0,
      transientFailure: true,
    });
    mocks.getUserAffiliations.mockResolvedValue([
      affiliation(42, 99, new Date(Date.now() - 2 * 60 * 60 * 1000)),
    ]);

    await expect(computeMapAccessClaims('map-1')).rejects.toBeInstanceOf(
      ProjectionUnavailableError,
    );
  });

  it('does not throw when affiliations remain stale after a completed refresh', async () => {
    mocks.getMapGrants.mockResolvedValue([
      { ownerType: 'character', ownerId: 42, role: 'viewer' },
    ]);
    mocks.getUserIdsOwningCharacters.mockResolvedValue(new Map([[42, 'stale']]));
    mocks.refreshStaleAffiliationsForUserWithOutcome.mockResolvedValue({
      refreshed: 0,
      transientFailure: false,
    });
    mocks.getUserAffiliations.mockResolvedValue([
      affiliation(42, 99, new Date(Date.now() - 2 * 60 * 60 * 1000)),
    ]);

    await expect(computeMapAccessClaims('map-1')).resolves.toEqual([
      { userId: 'creator', roles: ['admin'] },
      { userId: 'stale', roles: ['viewer'] },
    ]);
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
