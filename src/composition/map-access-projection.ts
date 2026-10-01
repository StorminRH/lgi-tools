import { z } from 'zod';
import {
  orderEligibleCharacters,
  resolveMatchedMapRoles,
  type DatedMapGrant,
  type MapPrincipals,
} from '@/data/maps/access';
import type { MapRole } from '@/data/maps/access-contract';
import { getBlockedMapUserIds } from '@/data/maps/blocks';
import {
  getCharacterNames,
  getMapAccessSubject,
  getMapGrants,
  getMapAccessCandidateUserIds,
  reserveMapAccessProjectionRevision,
} from '@/data/maps/queries';
import { postConvexHttpDoor } from '@/lib/convex-http-door';
import { getUsersAffiliations, type CachedAffiliation } from '@/platform/auth/affiliation-store';

export interface MapClaimCharacter {
  readonly characterId: number;
  readonly name: string;
}

/** `characters` is sent only for character-scoped maps; its absence keeps Convex on account-level tracking. */
export interface MapAccessClaim {
  readonly userId: string;
  readonly roles: readonly MapRole[];
  readonly characters?: readonly MapClaimCharacter[];
}

export interface ProjectionCounts {
  readonly inserted: number;
  readonly updated: number;
  readonly deleted: number;
  readonly unchanged: number;
}

export type ProjectionResult = ProjectionCounts & {
  readonly outcome: 'applied' | 'duplicate' | 'stale';
  readonly characterScoped?: true;
};

const projectionCountFields = {
  inserted: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  deleted: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
};
const characterScopedField = { characterScoped: z.literal(true).optional() };
const projectionResultSchema = z.discriminatedUnion('outcome', [
  z.strictObject({ ...projectionCountFields, ...characterScopedField, outcome: z.literal('applied') }),
  z.strictObject({ ...projectionCountFields, ...characterScopedField, outcome: z.literal('duplicate') }),
  z.strictObject({ ...projectionCountFields, outcome: z.literal('stale') }),
  z.strictObject({ ...projectionCountFields, outcome: z.literal('unscoped-refused') }),
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

/** Every linked character of these accounts, read as the projection reads them. */
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

function groupByUser(
  rows: readonly (CachedAffiliation & { userId: string })[],
): Map<string, CachedAffiliation[]> {
  const byUser = new Map<string, CachedAffiliation[]>();
  for (const row of rows) {
    const held = byUser.get(row.userId) ?? [];
    held.push(row);
    byUser.set(row.userId, held);
  }
  return byUser;
}

function grantOwnerIds(grants: readonly DatedMapGrant[], ownerType: DatedMapGrant['ownerType']) {
  return [...new Set(grants.filter((grant) => grant.ownerType === ownerType).map((g) => g.ownerId))];
}

async function nameCharacters(
  claims: readonly { userId: string; roles: readonly MapRole[]; characterIds: number[] }[],
): Promise<MapAccessClaim[]> {
  const names = await getCharacterNames(claims.flatMap((claim) => claim.characterIds));
  return claims.map(({ characterIds, ...claim }) => ({
    ...claim,
    characters: characterIds.map((characterId) => ({
      characterId,
      name: names.get(characterId) ?? `Character ${characterId}`,
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
  const byUser = groupByUser(await getUsersAffiliations(
    scoped ? [...candidateUserIds, map.userId] : candidateUserIds,
  ));

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

function postMapAccessProjection(
  body: unknown,
  options: ProjectMapAccessOptions = {},
): Promise<z.infer<typeof projectionResultSchema>> {
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

function claimsCarryCharacters(claims: readonly MapAccessClaim[]): boolean {
  return claims.length > 0 && claims.every((claim) => claim.characters !== undefined);
}

/**
 * A character-scoped claim set only counts once Convex confirms it kept the
 * characters; an older Convex drops them silently, so the change stays queued.
 */
function requireScopedDelivery(
  claims: readonly MapAccessClaim[],
  result: z.infer<typeof projectionResultSchema>,
): ProjectionResult {
  if (result.outcome === 'unscoped-refused') {
    throw new ProjectionUnavailableError(
      'Map access projection unavailable: Convex refused account-level claims for a character-scoped map',
    );
  }
  if (claimsCarryCharacters(claims) && result.outcome !== 'stale' && result.characterScoped !== true) {
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
): Promise<ProjectionResult> {
  if (options.signal?.aborted) {
    throw new ProjectionUnavailableError('Map access projection cancelled before computation');
  }
  const revision = await reserveMapAccessProjectionRevision();
  const claims = await computeMapAccessClaimsForState(mapId, allowArchived);
  if (options.signal?.aborted) {
    throw new ProjectionUnavailableError('Map access projection cancelled before delivery');
  }
  return requireScopedDelivery(
    claims,
    await postMapAccessProjection({ mapId, revision, claims }, options),
  );
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
  return requireCurrentProjection(requireScopedDelivery([], await postMapAccessProjection({
    mapId,
    revision,
    claims: [],
  })));
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
