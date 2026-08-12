// One-way Neon → Convex access projection. Computes the complete desired claim set
// for one map from durable Neon state and posts it through the bearer-gated service
// door. Convex claims are regenerable and never authoritative; this module is the
// only place that knows both the durable rule and the projection transport.
import { resolveMatchedMapRoles } from '@/data/maps/access';
import type { MapRole } from '@/data/maps/access-contract';
import {
  getMapAccessSubject,
  getMapGrants,
  getUserIdsInCorporations,
  getUserIdsOwningCharacters,
} from '@/data/maps/queries';
import { readEnv } from '@/lib/env';
import { fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { deriveConvexSiteUrl } from '@/lib/sync-engine';
import { refreshAffiliationsWithOutcome } from '@/platform/auth/affiliation';
import { listStaleLinkedCharacterIds } from '@/platform/auth/affiliation-store';
import { resolveMapPrincipalsWithOutcome } from './map-access';

/** One projected claim: the complete effective role set one user holds on one map. */
export interface MapAccessClaim {
  readonly userId: string;
  readonly roles: readonly MapRole[];
}

/** Counts returned by Convex's reconcile mutation for one projection. */
export interface ProjectionResult {
  readonly inserted: number;
  readonly updated: number;
  readonly deleted: number;
  readonly unchanged: number;
}

/**
 * Thrown when a projection cannot be computed or delivered safely. Callers own
 * retry/resync policy: grant-change and resync callers surface it; purge callers
 * swallow it best-effort.
 */
export class ProjectionUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ProjectionUnavailableError';
  }
}

/**
 * Computes the complete desired claim set for one map from durable Neon state.
 * Creator resolves to ['admin']; every candidate user reached by a character or
 * corporation grant is resolved through resolveMapPrincipals and the single
 * resolveMatchedMapRoles rule. Users with an empty role set are omitted. A
 * missing map returns the empty set (its projection tears down). Deterministic:
 * results are sorted by userId and roles are in MAP_ROLE_PRECEDENCE order.
 * Corporation-grant discovery refreshes every linked character whose affiliation
 * is missing or stale before the cached-corp lookup, so a newly entitled member
 * is not omitted solely because the cache still shows null or a prior corp.
 * Refresh-shortfall guard: throws ProjectionUnavailableError when that discovery
 * refresh or a candidate's stale-affiliation refresh fails transiently
 * (5xx/budget/thrown). Still-stale ids after a completed refresh (including ESI's
 * definitive 404 for deleted characters) contribute no corp roles via
 * memberCorpIds fail-closed and do not block convergence.
 */
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

/** Computes ordinary/resync claims, always denying archived durable maps. */
export function computeMapAccessClaims(mapId: string): Promise<MapAccessClaim[]> {
  return computeMapAccessClaimsForState(mapId, false);
}

async function postProjection(
  path: '/project-map-access' | '/purge-map-access',
  body: unknown,
  timeoutMs?: number,
  signal?: AbortSignal,
): Promise<unknown> {
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const secret = readEnv('CONVEX_SERVICE_SECRET');
  if (!convexUrl || !secret) {
    throw new ProjectionUnavailableError(
      'Map access projection unavailable: Convex URL or service secret is unset',
    );
  }

  const siteUrl = deriveConvexSiteUrl(convexUrl);
  if (siteUrl === null) {
    throw new ProjectionUnavailableError(
      'Map access projection unavailable: Convex site URL could not be derived',
    );
  }

  let response: Response;
  try {
    const init = {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secret}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
    };
    response =
      timeoutMs === undefined
        ? await fetchWithTimeout(`${siteUrl}${path}`, init)
        : await fetchWithTimeout(`${siteUrl}${path}`, init, timeoutMs);
  } catch (cause) {
    throw new ProjectionUnavailableError(
      `Map access projection unavailable: ${path} request failed`,
      { cause },
    );
  }

  if (!response.ok) {
    throw new ProjectionUnavailableError(
      `Map access projection unavailable: ${path} answered ${response.status}`,
    );
  }

  return response.json();
}

interface ProjectMapAccessOptions {
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

async function projectMapAccessState(
  mapId: string,
  options: ProjectMapAccessOptions,
  allowArchived: boolean,
): Promise<ProjectionResult> {
  if (options.signal?.aborted) {
    throw new ProjectionUnavailableError('Map access projection cancelled before computation');
  }
  const claims = await computeMapAccessClaimsForState(mapId, allowArchived);
  if (options.signal?.aborted) {
    throw new ProjectionUnavailableError('Map access projection cancelled before delivery');
  }
  const result = await postProjection(
    '/project-map-access',
    { mapId, claims },
    options.timeoutMs,
    options.signal,
  );
  return result as ProjectionResult;
}

/**
 * Projects active durable access into Convex, or empty claims for an archived
 * map. One-way by construction: Convex never decides durable truth.
 */
export function projectMapAccess(
  mapId: string,
  options: ProjectMapAccessOptions = {},
): Promise<ProjectionResult> {
  return projectMapAccessState(mapId, options, false);
}

/** Creation-only projection for the deliberately archived hidden staging row. */
export function projectStagedMapAccess(
  mapId: string,
  options: ProjectMapAccessOptions = {},
): Promise<ProjectionResult> {
  return projectMapAccessState(mapId, options, true);
}

/**
 * Tears down every projected claim for one map by posting an empty desired set.
 * Used when the durable map is already gone and compute would also return [].
 */
export async function teardownMapAccessProjection(mapId: string): Promise<ProjectionResult> {
  const result = await postProjection('/project-map-access', { mapId, claims: [] });
  return result as ProjectionResult;
}

/**
 * Deletes one user's projected claims across all maps through the bearer-gated
 * /purge-map-access door. Used by whole-user Neon purge after owned maps are gone.
 */
export async function purgeUserMapAccessProjection(
  userId: string,
): Promise<{ deleted: number }> {
  const result = await postProjection('/purge-map-access', { userId });
  return result as { deleted: number };
}
