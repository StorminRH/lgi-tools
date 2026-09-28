import { asc, eq, inArray, is } from 'drizzle-orm';
import { PgTable } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '@/composition/drizzle-schema';
import { purgeUserMapAccessProjection } from '@/composition/map-access-projection';
import { deliverCapturedMapAccessChanges } from '@/composition/map-affiliation-access';
import { PURGE_CONTRIBUTORS } from '@/composition/purge/register-all';
import { mergeLocationTrackingState } from '@/data/location-tracking/merge';
import { teardownLocationTracking } from '@/data/location-tracking/purge';
import type { PendingMapAccessChange } from '@/data/maps/authorization-sql';
import { enqueueMergeReprojection } from '@/data/maps/queries';
import { logUsageEvent } from '@/data/telemetry/queries';
import { directClient, resolveLockConnectionUrl } from '@/db';
import { account, user } from '@/db/auth-schema';
import { bestEffort } from '@/lib/best-effort';
import type { PostgresJsDb } from '@/lib/db-types';
import { accountMatch, eveAccountsForUser } from '@/platform/auth/eve-account-shared';
import { pickSurvivor, type MergeCandidate } from '@/platform/auth/owner-reconcile';
import { assertSourceEmpty, executeMergeRules } from '@/platform/purge/merge';
import type { MergeTx, PurgeContributor } from '@/platform/purge/types';

const SCHEMA_TABLES = (Object.values(schema) as unknown[]).filter((value): value is PgTable =>
  is(value, PgTable),
);

export interface MergeRequest {
  readonly linkingUserId: string;
  readonly otherUserId: string;
  readonly provenCharacterId: number;
  readonly jwtOwnerHash: string;
}

export type MergeNoopReason = 'same-user' | 'source-gone' | 'character-moved' | 'owner-unverified';

export interface CommittedMerge {
  readonly survivorUserId: string;
  readonly sourceUserId: string;
  readonly movedCharacterIds: readonly number[];
  readonly captured: readonly PendingMapAccessChange[];
}

export type MergeResult =
  | ({ readonly kind: 'merged' } & CommittedMerge)
  | { readonly kind: 'noop'; readonly reason: MergeNoopReason };

export interface MergeDeps {
  /** Defaults to a postgres-js handle on the unpooled endpoint; neon-http cannot transact. */
  readonly database?: PostgresJsDb;
  readonly contributors?: readonly PurgeContributor[];
}

interface ProvenAccount {
  readonly userId: string;
  readonly ownerHash: string | null;
}

/** Re-checks the picture under the row locks; a concurrent merge, unlink, reassign or re-link converges to a noop. */
export function resolveMergePair(
  request: MergeRequest,
  lockedUsers: readonly MergeCandidate[],
  provenAccount: ProvenAccount | undefined,
): { survivor: MergeCandidate; source: MergeCandidate } | { noop: MergeNoopReason } {
  const linking = lockedUsers.find((candidate) => candidate.id === request.linkingUserId);
  const other = lockedUsers.find((candidate) => candidate.id === request.otherUserId);
  if (linking === undefined || other === undefined) return { noop: 'source-gone' };
  if (provenAccount === undefined) return { noop: 'character-moved' };
  if (provenAccount.userId === request.linkingUserId) return { noop: 'same-user' };
  if (provenAccount.userId !== request.otherUserId) return { noop: 'character-moved' };
  if (provenAccount.ownerHash !== request.jwtOwnerHash) return { noop: 'owner-unverified' };
  return pickSurvivor(linking, other);
}

async function commitMerge(
  tx: MergeTx,
  contributors: readonly PurgeContributor[],
  { survivor, source }: { survivor: MergeCandidate; source: MergeCandidate },
): Promise<CommittedMerge> {
  const movedCharacterIds = (
    await tx.select({ accountId: account.accountId }).from(account).where(eveAccountsForUser(source.id))
  )
    .map((row) => Number(row.accountId))
    .filter((characterId) => Number.isFinite(characterId));
  const captured = await enqueueMergeReprojection(tx, { sourceUserId: source.id, movedCharacterIds });
  await executeMergeRules(tx, contributors, { sourceUserId: source.id, survivorUserId: survivor.id });
  if (source.role === 'ADMIN' && survivor.role !== 'ADMIN') {
    await tx.update(user).set({ role: 'ADMIN', updatedAt: new Date() }).where(eq(user.id, survivor.id));
  }
  await assertSourceEmpty(tx, SCHEMA_TABLES, source.id);
  await tx.delete(user).where(eq(user.id, source.id));
  return { survivorUserId: survivor.id, sourceUserId: source.id, movedCharacterIds, captured };
}

function directDatabase(): PostgresJsDb {
  resolveLockConnectionUrl();
  return drizzle(directClient);
}

/**
 * Moves everything the source user owns onto the survivor in one transaction
 * and deletes the source last, once proven empty. Both user rows are locked
 * in id order for the whole transaction; a throw rolls everything back.
 */
export async function mergeUsers(request: MergeRequest, deps: MergeDeps = {}): Promise<MergeResult> {
  const database = deps.database ?? directDatabase();
  const contributors = deps.contributors ?? PURGE_CONTRIBUTORS;
  const outcome = await database.transaction(async (tx) => {
    const lockedUsers = await tx
      .select({ id: user.id, createdAt: user.createdAt, role: user.role })
      .from(user)
      .where(inArray(user.id, [request.linkingUserId, request.otherUserId]))
      .orderBy(asc(user.id))
      .for('update');
    const [provenAccount] = await tx
      .select({ userId: account.userId, ownerHash: account.ownerHash })
      .from(account)
      .where(accountMatch(request.provenCharacterId))
      .for('update');
    const pair = resolveMergePair(request, lockedUsers, provenAccount);
    return 'noop' in pair ? pair : commitMerge(tx, contributors, pair);
  });
  if ('noop' in outcome) return { kind: 'noop', reason: outcome.noop };
  void logUsageEvent({
    action: 'auth_merge',
    characterId: request.provenCharacterId,
    metadata: {
      sourceUserId: outcome.sourceUserId,
      survivorUserId: outcome.survivorUserId,
      movedCharacterIds: outcome.movedCharacterIds,
    },
  }).catch((error) => console.error('[auth] merge telemetry write failed', error));
  return { kind: 'merged', ...outcome };
}

/**
 * Post-commit Convex work, in this order: move the source's tracking intent
 * (reprojection would otherwise delete it as revoked), then reproject the
 * captured maps, then sweep any source claims left behind. A failed merge
 * door degrades to a plain teardown: clearing the source's leases matters
 * more than keeping its toggles.
 */
export async function settleConvexAfterMerge(committed: CommittedMerge): Promise<void> {
  const { sourceUserId, survivorUserId, captured } = committed;
  try {
    await mergeLocationTrackingState(sourceUserId, survivorUserId);
  } catch (error) {
    console.error('[account-merge] merge door failed; tearing down source tracking', sourceUserId, error);
    await teardownLocationTracking(sourceUserId, null);
  }
  await bestEffort('account-merge', 'reprojection', sourceUserId, () =>
    deliverCapturedMapAccessChanges([...captured]),
  );
  await bestEffort('account-merge', 'map-access backstop', sourceUserId, () =>
    purgeUserMapAccessProjection(sourceUserId),
  );
}
