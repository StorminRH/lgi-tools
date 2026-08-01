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
 * Creator resolves to ['owner']; every candidate user reached by a character or
 * corporation grant is resolved through resolveMapPrincipals and the single
 * resolveMatchedMapRoles rule. Users with an empty role set are omitted. A
 * missing map returns the empty set (its projection tears down). Deterministic:
 * results are sorted by userId and roles are in MAP_ROLE_PRECEDENCE order.
 * Refresh-shortfall guard: throws ProjectionUnavailableError only when a
 * candidate's stale-affiliation refresh fails transiently (5xx/budget/thrown).
 * Still-stale ids after a completed refresh (including ESI's definitive 404 for
 * deleted characters) contribute no corp roles via memberCorpIds fail-closed and
 * do not block convergence.
 */
export async function computeMapAccessClaims(mapId: string): Promise<MapAccessClaim[]> {
  const map = await getMapAccessSubject(mapId);
  if (map === null) return [];

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

async function postProjection(
  path: '/project-map-access' | '/purge-map-access',
  body: unknown,
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
    response = await fetchWithTimeout(`${siteUrl}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${secret}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });
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

/**
 * Projects one map's durable access into Convex: computes the desired set and
 * POSTs it to the bearer-gated /project-map-access door. One-way by
 * construction — it sends state and returns Convex's reconcile counts; it
 * never reads Convex to decide durable truth.
 */
export async function projectMapAccess(mapId: string): Promise<ProjectionResult> {
  const claims = await computeMapAccessClaims(mapId);
  const result = await postProjection('/project-map-access', { mapId, claims });
  return result as ProjectionResult;
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
