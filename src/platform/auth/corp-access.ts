import { freshnessGate } from '@/lib/esi-datasets/freshness';
import { recordCorpAccessDecision, type CachedAffiliation } from './affiliation-store';

const AFFILIATION_FRESHNESS = freshnessGate('affiliations');

/** Request-local authorization: linked identity survives an expired corporation membership. */
export interface UserCorpAccess {
  readonly userId: string;
  readonly resolvedAt: number;
  readonly allCharacterIds: readonly number[];
  readonly corporationIds: readonly number[];
  readonly characterIdsByCorporation: Readonly<Record<number, readonly number[]>>;
  readonly refreshTransientFailure: boolean;
}

export function createCorpAccessSnapshot(
  userId: string,
  affiliations: readonly CachedAffiliation[],
  refreshTransientFailure = false,
  resolvedAt = Date.now(),
): UserCorpAccess {
  const members: Record<number, number[]> = {};
  const now = new Date(resolvedAt);
  for (const row of affiliations) {
    if (row.corporationId !== null && !AFFILIATION_FRESHNESS.isStale(row.refreshedAt, now)) {
      (members[row.corporationId] ??= []).push(row.characterId);
    }
  }
  for (const ids of Object.values(members)) Object.freeze(ids);
  return Object.freeze({
    userId,
    resolvedAt,
    allCharacterIds: Object.freeze(affiliations.map((row) => row.characterId)),
    corporationIds: Object.freeze(Object.keys(members).map(Number)),
    characterIdsByCorporation: Object.freeze(members),
    refreshTransientFailure,
  });
}

/** Mutation authorization is audited; audit failure prevents the mutation from proceeding. */
export async function authorizeCorpMutation(access: UserCorpAccess, corporationId: number) {
  const characterId = access.characterIdsByCorporation[corporationId]?.[0] ?? null;
  const allowed = characterId !== null;
  const reason = allowed ? 'member' : 'not_member';
  await recordCorpAccessDecision({ userId: access.userId, corporationId, characterId, allowed, reason });
  return { allowed, reason, characterId };
}
