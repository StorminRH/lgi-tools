import { z } from 'zod';
import { resolveMatchedMapRoles } from '@/data/maps/access';
import type { MapRole } from '@/data/maps/access-contract';
import {
  getMapAccessSubject,
  getMapGrants,
  getMapAccessCandidateUserIds,
  reserveMapAccessProjectionRevision,
} from '@/data/maps/queries';
import { postConvexHttpDoor } from '@/lib/convex-http-door';
import { getUsersAffiliations, type CachedAffiliation } from '@/platform/auth/affiliation-store';
import { createCorpAccessSnapshot } from '@/platform/auth/corp-access';

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

  const candidateUserIds = (await getMapAccessCandidateUserIds(characterIds, corporationIds))
    .filter((userId) => userId !== map.userId);
  const affiliations = await getUsersAffiliations(candidateUserIds);
  const byUser = new Map<string, CachedAffiliation[]>();
  for (const row of affiliations) {
    const rows = byUser.get(row.userId) ?? [];
    rows.push(row);
    byUser.set(row.userId, rows);
  }

  const resolvedAt = Date.now();
  const claims: MapAccessClaim[] = [{ userId: map.userId, roles: ['admin'] }];
  for (const userId of candidateUserIds) {
    const access = createCorpAccessSnapshot(userId, byUser.get(userId) ?? [], false, resolvedAt);
    const roles = resolveMatchedMapRoles({
      isCreator: false,
      grants,
      principals: { characterIds: access.allCharacterIds, corporationIds: access.corporationIds },
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

export async function revokeUserMapClaims(
  userId: string,
  mapIds: readonly string[],
): Promise<void> {
  // Keep each mutation below Convex's read/write limits; complete all batches
  // before unlinking so a failed delivery leaves the character linked.
  for (let start = 0; start < mapIds.length; start += 32) {
    const revision = await reserveMapAccessProjectionRevision();
    await postConvexHttpDoor({
      path: '/purge-user-map-claims',
      body: { userId, revision, mapIds: mapIds.slice(start, start + 32) },
      schema: userPurgeResultSchema,
      error: ProjectionUnavailableError,
      label: 'Map access revocation unavailable',
    });
  }
}
