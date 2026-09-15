import { freshnessGate } from '@/lib/esi-datasets/freshness';
import { refreshAffiliationsWithRows } from './affiliation';
import {
  getUserAffiliations,
  recordCorpAccessDecision,
  type CachedAffiliation,
} from './affiliation-store';
import type { AffiliationRow } from './affiliation-source';

const AFFILIATION_FRESHNESS = freshnessGate('affiliations');

export type CorpAccessReason = 'member' | 'not_member';

export interface CorpAccessDecision {
  allowed: boolean;
  reason: CorpAccessReason;
  characterId: number | null;
}

/**
 * Frozen per-request snapshot of a user's corp access. Freshness is frozen at
 * `resolvedAt`: character identity is unfresh (linking is a local fact) while
 * the member sets are fresh-only ESI authorization state. Never cached across
 * requests; selectors take no `now`.
 */
export interface UserCorpAccess {
  readonly userId: string;
  readonly resolvedAt: Date;
  readonly transientFailure: boolean;
  readonly memberCorpIds: readonly number[];
  readonly memberCharacterIdsByCorp: ReadonlyMap<number, readonly number[]>;
  readonly allCharacterIds: readonly number[];
}

function partitionFresh(
  rows: readonly CachedAffiliation[],
  now: Date,
): { memberCorpIds: number[]; memberCharacterIdsByCorp: Map<number, number[]> } {
  const memberCorpIds: number[] = [];
  const memberCharacterIdsByCorp = new Map<number, number[]>();
  for (const row of rows) {
    if (row.corporationId === null) continue;
    if (AFFILIATION_FRESHNESS.isStale(row.refreshedAt, now)) continue;
    let members = memberCharacterIdsByCorp.get(row.corporationId);
    if (members === undefined) {
      members = [];
      memberCharacterIdsByCorp.set(row.corporationId, members);
      memberCorpIds.push(row.corporationId);
    }
    members.push(row.characterId);
  }
  return { memberCorpIds, memberCharacterIdsByCorp };
}

function mergeRefreshed(
  rows: CachedAffiliation[],
  refreshed: readonly AffiliationRow[],
  resolvedAt: Date,
): CachedAffiliation[] {
  if (refreshed.length === 0) return rows;
  const freshByCharacter = new Map(refreshed.map((row) => [row.characterId, row]));
  return rows.map((row) => {
    const fresh = freshByCharacter.get(row.characterId);
    return fresh === undefined
      ? row
      : {
          characterId: row.characterId,
          corporationId: fresh.corporationId,
          allianceId: fresh.allianceId,
          factionId: fresh.factionId,
          refreshedAt: resolvedAt,
        };
  });
}

/**
 * Resolve one frozen corp-access snapshot: a single affiliation read, a refresh
 * of only the stale ids, and an in-memory merge of the confirmed rows. Never
 * throws on ESI failure — the member sets shrink and `transientFailure` is set.
 * Never audits; only `authorizeCorpMutation` writes the audit trail.
 */
export async function resolveUserCorpAccess(userId: string): Promise<UserCorpAccess> {
  const resolvedAt = new Date();
  const rows = await getUserAffiliations(userId);
  const staleIds = rows
    .filter((row) => AFFILIATION_FRESHNESS.isStale(row.refreshedAt, resolvedAt))
    .map((row) => row.characterId);
  const { rows: refreshed, transientFailure } = await refreshAffiliationsWithRows(staleIds);
  const { memberCorpIds, memberCharacterIdsByCorp } = partitionFresh(
    mergeRefreshed(rows, refreshed, resolvedAt),
    resolvedAt,
  );
  return Object.freeze({
    userId,
    resolvedAt,
    transientFailure,
    memberCorpIds: Object.freeze(memberCorpIds),
    memberCharacterIdsByCorp,
    allCharacterIds: Object.freeze(rows.map((row) => row.characterId)),
  });
}

export function isCorpMember(access: UserCorpAccess, corporationId: number): boolean {
  return access.memberCharacterIdsByCorp.has(corporationId);
}

export function memberCharacterIdsForCorp(
  access: UserCorpAccess,
  corporationId: number,
): readonly number[] {
  return access.memberCharacterIdsByCorp.get(corporationId) ?? [];
}

export function memberCharacterIdForCorp(
  access: UserCorpAccess,
  corporationId: number,
): number | null {
  return access.memberCharacterIdsByCorp.get(corporationId)?.[0] ?? null;
}

export function decideCorpMembership(
  access: UserCorpAccess,
  corporationId: number,
): CorpAccessDecision {
  const characterId = memberCharacterIdForCorp(access, corporationId);
  return characterId === null
    ? { allowed: false, reason: 'not_member', characterId: null }
    : { allowed: true, reason: 'member', characterId };
}

/**
 * The only audit writer. An audit throw propagates so the caller denies —
 * authorization without a trail fails closed.
 */
export async function authorizeCorpMutation(
  access: UserCorpAccess,
  corporationId: number,
): Promise<CorpAccessDecision> {
  const decision = decideCorpMembership(access, corporationId);
  await recordCorpAccessDecision({
    userId: access.userId,
    corporationId,
    characterId: decision.characterId,
    allowed: decision.allowed,
    reason: decision.reason,
  });
  return decision;
}
