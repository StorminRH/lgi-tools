import { isExpired } from '@/data/esi-store';
import { recordCorpAccessDecision, type CachedAffiliation } from './affiliation-store';

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
  readonly authorizedCharacterIds: readonly number[];
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
  for (const row of affiliations) {
    // An affiliation past CCP's expiry grants nothing until a refresh renews it.
    if (row.sharedAccessEligible && row.corporationId !== null && !isExpired(row.expiresAt?.getTime() ?? null, resolvedAt)) {
      (members[row.corporationId] ??= []).push(row.characterId);
    }
  }
  for (const ids of Object.values(members)) Object.freeze(ids);
  return Object.freeze({
    userId,
    resolvedAt,
    allCharacterIds: Object.freeze(affiliations.map((row) => row.characterId)),
    authorizedCharacterIds: Object.freeze(affiliations.filter((row) => row.sharedAccessEligible).map((row) => row.characterId)),
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
