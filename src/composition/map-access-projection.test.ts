import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CachedAffiliation } from '@/platform/auth/membership';

const mocks = vi.hoisted(() => ({
  getMapAccessSubject: vi.fn(),
  getMapGrants: vi.fn(),
  getUserIdsOwningCharacters: vi.fn(),
  getUserIdsInCorporations: vi.fn(),
  getUserAffiliations: vi.fn(),
  refreshStaleAffiliationsForUserWithOutcome: vi.fn(),
  fetchWithTimeout: vi.fn(),
  deriveConvexSiteUrl: vi.fn(),
  readEnv: vi.fn(),
}));

vi.mock('@/data/maps/queries', () => ({
  getMapAccessSubject: mocks.getMapAccessSubject,
  getMapGrants: mocks.getMapGrants,
  getUserIdsOwningCharacters: mocks.getUserIdsOwningCharacters,
  getUserIdsInCorporations: mocks.getUserIdsInCorporations,
}));
vi.mock('@/platform/auth/affiliation-store', () => ({
  getUserAffiliations: mocks.getUserAffiliations,
}));
vi.mock('@/platform/auth/affiliation', () => ({
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
  ProjectionUnavailableError,
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
  mocks.getUserAffiliations.mockResolvedValue([]);
  mocks.getMapAccessSubject.mockResolvedValue({
    userId: 'creator',
    archivedAt: null,
  });
  mocks.getMapGrants.mockResolvedValue([]);
  mocks.getUserIdsOwningCharacters.mockResolvedValue(new Map());
  mocks.getUserIdsInCorporations.mockResolvedValue(new Set());
  mocks.deriveConvexSiteUrl.mockReturnValue('http://127.0.0.1:3211');
  mocks.readEnv.mockImplementation((name: string) =>
    name === 'CONVEX_SERVICE_SECRET' ? 'svc-secret' : undefined,
  );
  vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', 'http://127.0.0.1:3210');
});

describe('computeMapAccessClaims', () => {
  it('returns creator-only owner claim for a map with no grants', async () => {
    await expect(computeMapAccessClaims('map-1')).resolves.toEqual([
      { userId: 'creator', roles: ['owner'] },
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
      { userId: 'creator', roles: ['owner'] },
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
      { userId: 'creator', roles: ['owner'] },
      { userId: 'member', roles: ['viewer'] },
    ]);
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
      { userId: 'creator', roles: ['owner'] },
      { userId: 'multi', roles: ['editor', 'viewer'] },
    ]);
  });

  it('omits a corp grant with no current members', async () => {
    mocks.getMapGrants.mockResolvedValue([
      { ownerType: 'corporation', ownerId: 990, role: 'viewer' },
    ]);
    mocks.getUserIdsInCorporations.mockResolvedValue(new Set());

    await expect(computeMapAccessClaims('map-1')).resolves.toEqual([
      { userId: 'creator', roles: ['owner'] },
    ]);
  });

  it('returns an empty set for a missing map', async () => {
    mocks.getMapAccessSubject.mockResolvedValue(null);
    await expect(computeMapAccessClaims('missing')).resolves.toEqual([]);
  });

  it('converges when a completed refresh leaves a biomassed character stale (404 omissions)', async () => {
    // ESI 404-poisoned batch: refresh completed without transient failure, but the
    // dead character's refreshedAt stays stale — corp roles fail closed, compute continues.
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
      { userId: 'creator', roles: ['owner'] },
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

    // Character principal still matches; only corp membership is fail-closed on staleness.
    await expect(computeMapAccessClaims('map-1')).resolves.toEqual([
      { userId: 'creator', roles: ['owner'] },
      { userId: 'stale', roles: ['viewer'] },
    ]);
  });
});

describe('projectMapAccess transport', () => {
  it('posts the computed claim set and returns reconcile counts', async () => {
    mocks.fetchWithTimeout.mockResolvedValue(
      new Response(JSON.stringify({ inserted: 1, updated: 0, deleted: 0, unchanged: 0 }), {
        status: 200,
      }),
    );

    await expect(projectMapAccess('map-1')).resolves.toEqual({
      inserted: 1,
      updated: 0,
      deleted: 0,
      unchanged: 0,
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
          claims: [{ userId: 'creator', roles: ['owner'] }],
        }),
      }),
    );
  });

  it('throws when the door answers non-2xx', async () => {
    mocks.fetchWithTimeout.mockResolvedValue(new Response('nope', { status: 503 }));
    await expect(projectMapAccess('map-1')).rejects.toBeInstanceOf(ProjectionUnavailableError);
  });

  it('throws when Convex env is unset', async () => {
    vi.stubEnv('NEXT_PUBLIC_CONVEX_URL', '');
    mocks.readEnv.mockReturnValue(undefined);
    await expect(projectMapAccess('map-1')).rejects.toBeInstanceOf(ProjectionUnavailableError);
  });
});
