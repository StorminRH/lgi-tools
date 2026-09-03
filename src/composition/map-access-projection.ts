import { z } from 'zod';
import { resolveMatchedMapRoles } from '@/data/maps/access';
import type { MapRole } from '@/data/maps/access-contract';
import {
  getMapAccessSubject,
  getMapGrants,
  getUserIdsInCorporations,
  getUserIdsOwningCharacters,
  reserveMapAccessProjectionRevision,
} from '@/data/maps/queries';
import { postConvexHttpDoor } from '@/lib/convex-http-door';
import { refreshAffiliationsWithOutcome } from '@/platform/auth/affiliation';
import { listStaleLinkedCharacterIds } from '@/platform/auth/affiliation-store';
import { resolveMapPrincipalsWithOutcome } from './map-access';

export interface MapAccessClaim {
  readonly userId: string;
  readonly roles: readonly MapRole[];
}

export interface ProjectionCounts {
  readonly inserted: number;
  readonly updated: number;
  readonly deleted: number;
  readonly unchanged: number;
}

export type ProjectionResult = ProjectionCounts & {
  readonly outcome: 'applied' | 'duplicate' | 'stale';
};

const projectionCountFields = {
  inserted: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  deleted: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
};
const projectionResultSchema = z.discriminatedUnion('outcome', [
  z.strictObject({ ...projectionCountFields, outcome: z.literal('applied') }),
  z.strictObject({ ...projectionCountFields, outcome: z.literal('duplicate') }),
  z.strictObject({ ...projectionCountFields, outcome: z.literal('stale') }),
]);

const userPurgeResultSchema = z.strictObject({
  deleted: z.number().int().nonnegative(),
});

export function requireCurrentProjection(result: ProjectionResult): ProjectionResult {
  if (result.outcome === 'stale') {
    throw new ProjectionUnavailableError(
      'Map access projection unavailable: a newer projection already won',
    );
  }
  return result;
}

export class ProjectionUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ProjectionUnavailableError';
  }
}

async function computeMapAccessClaimsForState(
  mapId: string,
  allowArchived: boolean,
): Promise<MapAccessClaim[]> {
  const map = await getMapAccessSubject(mapId);
  if (map === null) return [];
  if (map.archivedAt !== null && !allowArchived) return [];

  const grants = await getMapGrants(mapId);
  const characterIds = [
    ...new Set(
      grants
        .filter((grant) => grant.ownerType === 'character')
        .map((grant) => grant.ownerId),
    ),
  ];
  const corporationIds = [
    ...new Set(
      grants
        .filter((grant) => grant.ownerType === 'corporation')
        .map((grant) => grant.ownerId),
    ),
  ];

  if (corporationIds.length > 0) {
    const staleCharacterIds = await listStaleLinkedCharacterIds();
    const { transientFailure } = await refreshAffiliationsWithOutcome(staleCharacterIds);
    if (transientFailure) {
      throw new ProjectionUnavailableError(
        'Map access projection unavailable: affiliation refresh failed transiently while discovering corporation candidates',
      );
    }
  }

  const [characterOwners, corporationMembers] = await Promise.all([
    getUserIdsOwningCharacters(characterIds),
    getUserIdsInCorporations(corporationIds),
  ]);

  const candidateUserIds = new Set<string>([
    map.userId,
    ...characterOwners.values(),
    ...corporationMembers,
  ]);

  const claims: MapAccessClaim[] = [];
  for (const userId of candidateUserIds) {
    const { principals, refreshTransientFailure } =
      await resolveMapPrincipalsWithOutcome(userId);
    if (refreshTransientFailure) {
      throw new ProjectionUnavailableError(
        `Map access projection unavailable: affiliation refresh failed transiently for user ${userId}`,
      );
    }

    const roles = resolveMatchedMapRoles({
      isCreator: map.userId === userId,
      grants,
      principals,
    });
    if (roles.length === 0) continue;
    claims.push({ userId, roles });
  }

  claims.sort((left, right) => left.userId.localeCompare(right.userId));
  return claims;
}

export function computeMapAccessClaims(mapId: string): Promise<MapAccessClaim[]> {
  return computeMapAccessClaimsForState(mapId, false);
}

export interface ProjectMapAccessOptions {
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

function postMapAccessProjection(
  body: unknown,
  options: ProjectMapAccessOptions = {},
): Promise<ProjectionResult> {
  return postConvexHttpDoor({
    path: '/project-map-access',
    body,
    schema: projectionResultSchema,
    error: ProjectionUnavailableError,
    label: 'Map access projection unavailable',
    timeoutMs: options.timeoutMs,
    signal: options.signal,
  });
}

async function projectMapAccessState(
  mapId: string,
  options: ProjectMapAccessOptions,
  allowArchived: boolean,
): Promise<ProjectionResult> {
  if (options.signal?.aborted) {
    throw new ProjectionUnavailableError('Map access projection cancelled before computation');
  }
  const revision = await reserveMapAccessProjectionRevision();
  const claims = await computeMapAccessClaimsForState(mapId, allowArchived);
  if (options.signal?.aborted) {
    throw new ProjectionUnavailableError('Map access projection cancelled before delivery');
  }
  return postMapAccessProjection({ mapId, revision, claims }, options);
}

export function projectMapAccess(
  mapId: string,
  options: ProjectMapAccessOptions = {},
): Promise<ProjectionResult> {
  return projectMapAccessState(mapId, options, false);
}

export function projectStagedMapAccess(
  mapId: string,
  options: ProjectMapAccessOptions = {},
): Promise<ProjectionResult> {
  return projectMapAccessState(mapId, options, true);
}

export async function teardownMapAccessProjection(mapId: string): Promise<ProjectionResult> {
  const revision = await reserveMapAccessProjectionRevision();
  return requireCurrentProjection(
    await postMapAccessProjection({
      mapId,
      revision,
      claims: [],
    }),
  );
}

export async function purgeUserMapAccessProjection(
  userId: string,
): Promise<{ deleted: number }> {
  return postConvexHttpDoor({
    path: '/purge-map-access',
    body: { userId },
    schema: userPurgeResultSchema,
    error: ProjectionUnavailableError,
    label: 'Map access projection unavailable',
  });
}
