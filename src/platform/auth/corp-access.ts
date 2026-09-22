import { recordCorpAccessDecision, type CachedAffiliation } from './affiliation-store';
import { AFFILIATION_FRESHNESS } from './affiliation-policy';

export type CorpAccessReason = 'member' | 'not_member';

export interface CorpAccessDecision {
  readonly allowed: boolean;
  readonly reason: CorpAccessReason;
  readonly characterId: number | null;
}

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
    corporationIds: Object.freeze(Object.keys(members).map(Number).sort((a, b) => a - b)),
    characterIdsByCorporation: Object.freeze(members),
    refreshTransientFailure,
  });
}

export async function authorizeCorpMutation(access: UserCorpAccess, corporationId: number): Promise<CorpAccessDecision> {
  const characterId = access.characterIdsByCorporation[corporationId]?.[0] ?? null;
  const allowed = characterId !== null;
  const reason: CorpAccessReason = allowed ? 'member' : 'not_member';
  await recordCorpAccessDecision({ userId: access.userId, corporationId, characterId, allowed, reason });
  return { allowed, reason, characterId };
}
