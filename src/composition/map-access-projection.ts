import {
  orderEligibleCharacters,
  resolveMatchedMapRoles,
  type DatedMapGrant,
  type MapPrincipals,
} from '@/data/maps/access';
import {
  claimsCarryCharacters,
  MAP_CLAIM_PURGE_BATCH,
  type MapRole,
} from '@/data/maps/access-contract';
import { getBlockedMapUserIds } from '@/data/maps/blocks';
import {
  projectMapAccessDoor,
  purgeMapAccessDoor,
  purgeUserMapClaimsDoor,
} from '@/data/maps/convex-doors';
import {
  getCharacterNames,
  getMapAccessSubject,
  getMapGrants,
  getMapAccessCandidateUserIds,
  reserveMapAccessProjectionRevision,
} from '@/data/maps/queries';
import { chunk, groupBy } from '@/lib/array';
import type { ConvexDoorRequest, ConvexDoorResponse } from '@/lib/convex-door-contract';
import { ConvexDoorError, postConvexHttpDoor } from '@/lib/convex-http-door';
import { unresolvedName } from '@/lib/format/names';
import { getUsersAffiliations, type CachedAffiliation } from '@/platform/auth/affiliation-store';

/** `characters` is sent only for character-scoped maps; its absence keeps Convex on account-level tracking. */
export type MapAccessClaim = ConvexDoorRequest<typeof projectMapAccessDoor>['claims'][number];

/**
 * A delivery that counts. One a newer projection already overrode, or one
 * Convex refused, rejects with ProjectionUnavailableError instead.
 */
export type CurrentProjectionResult = Exclude<
  ConvexDoorResponse<typeof projectMapAccessDoor>,
  { readonly outcome: 'stale' | 'unscoped-refused' }
>;

export class ProjectionUnavailableError extends ConvexDoorError {
  override readonly name = 'ProjectionUnavailableError';
}

function sharedAccessRows(rows: readonly CachedAffiliation[]): CachedAffiliation[] {
  return rows.filter((row) => row.sharedAccessEligible);
}

function principalsIgnoringStampAge(rows: readonly CachedAffiliation[]): MapPrincipals {
  const eligible = sharedAccessRows(rows);
  return {
    characterIds: eligible.map((row) => row.characterId),
    corporationIds: [...new Set(eligible.flatMap((row) => row.corporationId ?? []))],
  };
}

export type AccountAffiliation = CachedAffiliation & { readonly userId: string };

/**
 * Every linked character of these accounts, read as the projection reads them.
 * Map scoping reads through here because the corp-access lint boundary keeps
 * raw affiliation reads inside access resolution.
 */
export function readAccountAffiliations(userIds: readonly string[]): Promise<AccountAffiliation[]> {
  return getUsersAffiliations(userIds);
}

/** The ids each user's eligible characters are chosen from, in actor-name order. */
export function eligibleCharacterIds(
  grants: readonly DatedMapGrant[],
  rows: readonly CachedAffiliation[],
): number[] {
  return orderEligibleCharacters(grants, sharedAccessRows(rows));
}

function grantOwnerIds(grants: readonly DatedMapGrant[], ownerType: DatedMapGrant['ownerType']) {
  return [...new Set(grants.filter((grant) => grant.ownerType === ownerType).map((g) => g.ownerId))];
}

async function nameCharacters(
  claims: readonly { userId: string; roles: MapRole[]; characterIds: number[] }[],
): Promise<MapAccessClaim[]> {
  const names = await getCharacterNames(claims.flatMap((claim) => claim.characterIds));
  return claims.map(({ characterIds, ...claim }) => ({
    ...claim,
    characters: characterIds.map((characterId) => ({
      characterId,
      name: names.get(characterId) ?? unresolvedName('character', characterId),
    })),
  }));
}

/** Blocked accounts get no claim; the creator is never blocked. */
export function unblockedCandidates(
  candidateUserIds: readonly string[],
  blockedUserIds: readonly string[],
  creatorUserId: string,
): string[] {
  const blocked = new Set(blockedUserIds);
  return candidateUserIds.filter((userId) => userId !== creatorUserId && !blocked.has(userId));
}

async function computeMapAccessClaimsForState(
  mapId: string,
  allowArchived: boolean,
): Promise<MapAccessClaim[]> {
  const map = await getMapAccessSubject(mapId);
  if (map === null) return [];
  if (map.archivedAt !== null && !allowArchived) return [];
  const scoped = map.characterScopedAt !== null;

  const grants = await getMapGrants(mapId);
  const candidateUserIds = unblockedCandidates(
    await getMapAccessCandidateUserIds(
      grantOwnerIds(grants, 'character'),
      grantOwnerIds(grants, 'corporation'),
    ),
    await getBlockedMapUserIds(mapId),
    map.userId,
  );
  const byUser = groupBy(
    await getUsersAffiliations(scoped ? [...candidateUserIds, map.userId] : candidateUserIds),
    (row) => row.userId,
  );

  const claims = [{ userId: map.userId, roles: ['admin'] as MapRole[], characterIds: [] as number[] }];
  for (const userId of candidateUserIds) {
    const roles = resolveMatchedMapRoles({
      isCreator: false,
      grants,
      principals: principalsIgnoringStampAge(byUser.get(userId) ?? []),
    });
    if (roles.length === 0) continue;
    claims.push({ userId, roles: [...roles], characterIds: [] });
  }
  claims.sort((left, right) => left.userId.localeCompare(right.userId));
  if (!scoped) return claims.map(({ userId, roles }) => ({ userId, roles }));

  for (const claim of claims) {
    claim.characterIds = eligibleCharacterIds(grants, byUser.get(claim.userId) ?? []);
  }
  return nameCharacters(claims);
}

export function computeMapAccessClaims(mapId: string): Promise<MapAccessClaim[]> {
  return computeMapAccessClaimsForState(mapId, false);
}

export interface ProjectMapAccessOptions {
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

/** Per-map delivery timeout for background reprojection runs. */
export const MAP_ACCESS_DELIVERY_TIMEOUT_MS = 4_000;
/** Total time one background reprojection run may spend delivering. */
export const MAP_ACCESS_RECONCILE_BUDGET_MS = 20_000;

function postMapAccessProjection(
  body: ConvexDoorRequest<typeof projectMapAccessDoor>,
  options: ProjectMapAccessOptions = {},
): Promise<ConvexDoorResponse<typeof projectMapAccessDoor>> {
  return postConvexHttpDoor(projectMapAccessDoor, body, {
    error: ProjectionUnavailableError,
    label: 'Map access projection unavailable',
    timeoutMs: options.timeoutMs,
    signal: options.signal,
  });
}

/**
 * A delivery only counts when it is current: a newer projection may already
 * have won. A character-scoped claim set also only counts once Convex confirms
 * it kept the characters; an older Convex drops them silently, so the change
 * stays queued.
 */
function requireCurrentDelivery(
  claims: readonly MapAccessClaim[],
  result: ConvexDoorResponse<typeof projectMapAccessDoor>,
): CurrentProjectionResult {
  if (result.outcome === 'unscoped-refused') {
    throw new ProjectionUnavailableError(
      'Map access projection unavailable: Convex refused account-level claims for a character-scoped map',
    );
  }
  if (result.outcome === 'stale') {
    throw new ProjectionUnavailableError(
      'Map access projection unavailable: a newer projection already won',
    );
  }
  if (claimsCarryCharacters(claims) && result.characterScoped !== true) {
    throw new ProjectionUnavailableError(
      'Map access projection unavailable: Convex did not confirm character-scoped claims',
    );
  }
  return result;
}

async function projectMapAccessState(
  mapId: string,
  options: ProjectMapAccessOptions,
  allowArchived: boolean,
): Promise<CurrentProjectionResult> {
  if (options.signal?.aborted) {
    throw new ProjectionUnavailableError('Map access projection cancelled before computation');
  }
  const revision = await reserveMapAccessProjectionRevision();
  const claims = await computeMapAccessClaimsForState(mapId, allowArchived);
  if (options.signal?.aborted) {
    throw new ProjectionUnavailableError('Map access projection cancelled before delivery');
  }
  return requireCurrentDelivery(
    claims,
    await postMapAccessProjection({ mapId, revision, claims }, options),
  );
}

export function projectMapAccess(
  mapId: string,
  options: ProjectMapAccessOptions = {},
): Promise<CurrentProjectionResult> {
  return projectMapAccessState(mapId, options, false);
}

export function projectStagedMapAccess(
  mapId: string,
  options: ProjectMapAccessOptions = {},
): Promise<CurrentProjectionResult> {
  return projectMapAccessState(mapId, options, true);
}

export async function teardownMapAccessProjection(mapId: string): Promise<CurrentProjectionResult> {
  const revision = await reserveMapAccessProjectionRevision();
  return requireCurrentDelivery([], await postMapAccessProjection({
    mapId,
    revision,
    claims: [],
  }));
}

export async function purgeUserMapAccessProjection(
  userId: string,
): Promise<{ deleted: number }> {
  return postConvexHttpDoor(purgeMapAccessDoor, { userId }, {
    error: ProjectionUnavailableError,
    label: 'Map access projection unavailable',
  });
}

export async function revokeUserMapClaims(
  userId: string,
  mapIds: readonly string[],
): Promise<void> {
  // Complete all batches before unlinking so a failed delivery leaves the
  // character linked.
  for (const batch of chunk(mapIds, MAP_CLAIM_PURGE_BATCH)) {
    const revision = await reserveMapAccessProjectionRevision();
    await postConvexHttpDoor(purgeUserMapClaimsDoor, { userId, revision, mapIds: batch }, {
      error: ProjectionUnavailableError,
      label: 'Map access revocation unavailable',
    });
  }
}
