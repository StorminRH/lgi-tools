import { z } from 'zod';
import { readPendingMapTrackingTransfers } from '@/data/location-tracking/merge-store';
import type { DatedMapGrant } from '@/data/maps/access';
import { canonicalizeMapRoles } from '@/data/maps/access-contract';
import {
  insertGrandfatherGrants,
  listUnscopedMapIds,
  stampCharacterScoped,
  type GrandfatherGrant,
} from '@/data/maps/character-scoping';
import { getMapGrants } from '@/data/maps/queries';
import { groupBy } from '@/lib/array';
import { postConvexHttpDoor } from '@/lib/convex-http-door';
import { AUTHORIZATION_MAX_FAILURE_AGE_MS } from '@/platform/auth/authorization-policy';
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
const GRANDFATHER_PASSES = 3;

export interface TrackedPair {
  readonly userId: string;
  readonly characterId: number;
}

const trackingSnapshotSchema = z.object({
  tracked: z.array(z.object({ userId: z.string(), characterId: z.number().int() })),
});

async function freezeMapTrackingForScoping(mapId: string): Promise<TrackedPair[]> {
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
  const rows = groupBy(affiliations, (row) => row.userId);
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
    granted.set(characterId, { userId, characterId, role });
  }
  return [...granted.values()];
}

export interface MapScopingDependencies {
  readonly computeClaims?: typeof computeMapAccessClaims;
  readonly readGrants?: typeof getMapGrants;
  readonly freezeTracking?: typeof freezeMapTrackingForScoping;
  readonly readTransfers?: typeof readPendingMapTrackingTransfers;
  readonly readAffiliations?: typeof readAccountAffiliations;
  readonly grandfather?: typeof insertGrandfatherGrants;
  readonly stamp?: typeof stampCharacterScoped;
  readonly deliver?: typeof deliverCapturedMapAccessChanges;
}

function trackedPairKey(pair: TrackedPair): string {
  return `${pair.userId}:${pair.characterId}`;
}

async function grandfatherPass(
  mapId: string,
  deps: Required<MapScopingDependencies>,
): Promise<void> {
  const frozen = await deps.freezeTracking(mapId);
  let transfers = await deps.readTransfers(mapId);
  for (let pass = 0; pass < GRANDFATHER_PASSES; pass += 1) {
    const tracked = [...new Map([...frozen, ...transfers].map((pair) => [trackedPairKey(pair), pair])).values()];
    const [claims, grants] = await Promise.all([deps.computeClaims(mapId), deps.readGrants(mapId)]);
    const affiliations = await deps.readAffiliations([...new Set(tracked.map((pair) => pair.userId))]);
    await deps.grandfather(
      mapId,
      grandfatherGrants({ claims, grants, tracked, affiliations }),
      new Date(Date.now() - AUTHORIZATION_MAX_FAILURE_AGE_MS),
    );
    const nextTransfers = await deps.readTransfers(mapId);
    const considered = new Set(tracked.map(trackedPairKey));
    if (nextTransfers.every((pair) => considered.has(trackedPairKey(pair)))) return;
    transfers = nextTransfers;
  }
  throw new ProjectionUnavailableError('Map character scoping retained for retry while tracking merges change');
}

function withDefaults(deps: MapScopingDependencies): Required<MapScopingDependencies> {
  return {
    computeClaims: deps.computeClaims ?? computeMapAccessClaims,
    readGrants: deps.readGrants ?? getMapGrants,
    freezeTracking: deps.freezeTracking ?? freezeMapTrackingForScoping,
    readTransfers: deps.readTransfers ?? readPendingMapTrackingTransfers,
    readAffiliations: deps.readAffiliations ?? readAccountAffiliations,
    grandfather: deps.grandfather ?? insertGrandfatherGrants,
    stamp: deps.stamp ?? stampCharacterScoped,
    deliver: deps.deliver ?? deliverCapturedMapAccessChanges,
  };
}

/**
 * Moves one legacy map to per-character tracking without dropping a tracked
 * character. The snapshot atomically pauses new opt-ins; existing tracking
 * and opt-out remain available. Grants are revalidated in their SQL write,
 * then the map is stamped and reprojected. Only the scoped Convex projection
 * releases the pause. An unscoped failure retries next run; a stamped failure
 * keeps its queued projection for retry without reopening the cutover race.
 */
export async function scopeLegacyMap(
  mapId: string,
  dependencies: MapScopingDependencies = {},
): Promise<boolean> {
  const deps = withDefaults(dependencies);
  await grandfatherPass(mapId, deps);
  const pending = await deps.stamp(mapId);
  if (pending === null) return true;
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
