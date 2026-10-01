import { z } from 'zod';
import type { DatedMapGrant } from '@/data/maps/access';
import { canonicalizeMapRoles } from '@/data/maps/access-contract';
import type { PendingMapAccessChange } from '@/data/maps/authorization-sql';
import {
  grandfatherCharacterGrants,
  listUnscopedMapIds,
  type GrandfatherGrant,
} from '@/data/maps/character-scoping';
import { getMapGrants } from '@/data/maps/queries';
import { postConvexHttpDoor } from '@/lib/convex-http-door';
import {
  computeMapAccessClaims,
  eligibleCharacterIds,
  ProjectionUnavailableError,
  readAccountAffiliations,
  type AccountAffiliation,
  type MapAccessClaim,
} from './map-access-projection';
import { deliverCapturedMapAccessChanges } from './map-affiliation-access';

const SCOPING_BATCH = 50;

export interface TrackedPair {
  readonly userId: string;
  readonly characterId: number;
}

const trackingSnapshotSchema = z.object({
  tracked: z.array(z.object({ userId: z.string(), characterId: z.number().int() })),
});

async function readMapTrackingSnapshot(mapId: string): Promise<TrackedPair[]> {
  const snapshot = await postConvexHttpDoor({
    path: '/map-tracking-snapshot',
    body: { mapId },
    schema: trackingSnapshotSchema,
    error: ProjectionUnavailableError,
    label: 'Map tracking snapshot unavailable',
  });
  return snapshot.tracked;
}

function highestRoleByUser(claims: readonly MapAccessClaim[]) {
  return new Map(claims.flatMap((claim) => {
    const [highest] = canonicalizeMapRoles(claim.roles);
    return highest === undefined ? [] : [[claim.userId, highest] as const];
  }));
}

function eligibleByUser(grants: readonly DatedMapGrant[], affiliations: readonly AccountAffiliation[]) {
  const rows = new Map<string, AccountAffiliation[]>();
  for (const row of affiliations) rows.set(row.userId, [...(rows.get(row.userId) ?? []), row]);
  return new Map([...rows].map(([userId, held]) => [userId, new Set(eligibleCharacterIds(grants, held))]));
}

/**
 * Tracked characters that would stop being trackable once the map is
 * character-scoped get a character grant at their account's highest current
 * role. A pair whose account no longer holds a claim, or that tracks a
 * character the account does not own, is not carried over.
 */
export function grandfatherGrants(input: {
  readonly claims: readonly MapAccessClaim[];
  readonly grants: readonly DatedMapGrant[];
  readonly tracked: readonly TrackedPair[];
  readonly affiliations: readonly AccountAffiliation[];
}): GrandfatherGrant[] {
  const roles = highestRoleByUser(input.claims);
  const owned = new Set(input.affiliations.map((row) => `${row.userId}:${row.characterId}`));
  const eligible = eligibleByUser(input.grants, input.affiliations);
  const granted = new Map<number, GrandfatherGrant>();
  for (const { userId, characterId } of input.tracked) {
    const role = roles.get(userId);
    if (role === undefined || !owned.has(`${userId}:${characterId}`)) continue;
    if (eligible.get(userId)?.has(characterId) === true || granted.has(characterId)) continue;
    granted.set(characterId, { characterId, role });
  }
  return [...granted.values()];
}

export interface MapScopingDependencies {
  readonly computeClaims?: typeof computeMapAccessClaims;
  readonly readGrants?: typeof getMapGrants;
  readonly readTracked?: typeof readMapTrackingSnapshot;
  readonly readAffiliations?: typeof readAccountAffiliations;
  readonly grandfather?: typeof grandfatherCharacterGrants;
  readonly deliver?: typeof deliverCapturedMapAccessChanges;
}

async function grandfatherPass(
  mapId: string,
  deps: Required<MapScopingDependencies>,
): Promise<PendingMapAccessChange | null> {
  const [claims, grants, tracked] = await Promise.all([
    deps.computeClaims(mapId),
    deps.readGrants(mapId),
    deps.readTracked(mapId),
  ]);
  const affiliations = await deps.readAffiliations([...new Set(tracked.map((pair) => pair.userId))]);
  return deps.grandfather(mapId, grandfatherGrants({ claims, grants, tracked, affiliations }));
}

function withDefaults(deps: MapScopingDependencies): Required<MapScopingDependencies> {
  return {
    computeClaims: deps.computeClaims ?? computeMapAccessClaims,
    readGrants: deps.readGrants ?? getMapGrants,
    readTracked: deps.readTracked ?? readMapTrackingSnapshot,
    readAffiliations: deps.readAffiliations ?? readAccountAffiliations,
    grandfather: deps.grandfather ?? grandfatherCharacterGrants,
    deliver: deps.deliver ?? deliverCapturedMapAccessChanges,
  };
}

/**
 * Moves one legacy map to per-character tracking without dropping a tracked
 * character: grants and the scoping stamp land together before anything is
 * reprojected. A second pass catches characters tracked while the first ran,
 * since the live claims stay account-level until the reprojection. Returns
 * whether the reprojection was delivered; a failed one stays queued for retry.
 */
export async function scopeLegacyMap(
  mapId: string,
  dependencies: MapScopingDependencies = {},
): Promise<boolean> {
  const deps = withDefaults(dependencies);
  const first = await grandfatherPass(mapId, deps);
  if (first === null) return true;
  const pending = await grandfatherPass(mapId, deps) ?? first;
  const delivered = await deps.deliver([pending]);
  return delivered.failed === 0;
}

/** One resumable batch of the legacy-map backfill; stops at the deadline and resumes next run. */
export async function scopeLegacyMaps(
  deadline: number,
  dependencies: MapScopingDependencies & { readonly listMapIds?: typeof listUnscopedMapIds } = {},
): Promise<{ succeeded: number; failed: number }> {
  const mapIds = await (dependencies.listMapIds ?? listUnscopedMapIds)(SCOPING_BATCH);
  const counts = { succeeded: 0, failed: 0 };
  for (const mapId of mapIds) {
    if (Date.now() >= deadline) break;
    try {
      if (await scopeLegacyMap(mapId, dependencies)) counts.succeeded += 1;
      else counts.failed += 1;
    } catch (error) {
      console.error('[map-character-scoping] map kept for retry', mapId, error);
      counts.failed += 1;
    }
  }
  return counts;
}
