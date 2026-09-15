import { refreshStaleAffiliationsForUserWithOutcome } from './affiliation';
import { getUserAffiliations, recordCorpAccessDecision } from './affiliation-store';
import {
  type CachedAffiliation,
  memberCharacterIdInCorp,
  memberCharacterIdsInCorp,
  memberCorpIds,
} from './membership';

export type CorpAccessReason = 'member' | 'not_member';

export interface CorpAccessDecision {
  readonly allowed: boolean;
  readonly reason: CorpAccessReason;
  readonly characterId: number | null;
}

export interface UserCorpAccess {
  readonly userId: string;
  readonly characterIds: readonly number[];
  readonly corporationIds: readonly number[];
  readonly refreshTransientFailure: boolean;
  has(corporationId: number): boolean;
  characterIdsIn(corporationId: number): readonly number[];
  decide(corporationId: number): Promise<CorpAccessDecision>;
}

export async function loadUserCorpAccess(userId: string): Promise<UserCorpAccess> {
  const refresh = await refreshStaleAffiliationsForUserWithOutcome(userId);
  const affiliations = await getUserAffiliations(userId);
  return freezeUserCorpAccess({
    userId,
    affiliations,
    refreshTransientFailure: refresh.transientFailure,
    now: new Date(),
  });
}

function freezeUserCorpAccess(input: {
  userId: string;
  affiliations: readonly CachedAffiliation[];
  refreshTransientFailure: boolean;
  now: Date;
}): UserCorpAccess {
  const affiliations = [...input.affiliations];
  const members = new Map<number, readonly number[]>();
  for (const corporationId of memberCorpIds(affiliations, input.now)) {
    members.set(corporationId, memberCharacterIdsInCorp(affiliations, corporationId, input.now));
  }

  return {
    userId: input.userId,
    characterIds: affiliations.map((row) => row.characterId),
    corporationIds: [...members.keys()],
    refreshTransientFailure: input.refreshTransientFailure,
    has(corporationId) {
      return members.has(corporationId);
    },
    characterIdsIn(corporationId) {
      return members.get(corporationId) ?? [];
    },
    async decide(corporationId) {
      const characterId = memberCharacterIdInCorp(affiliations, corporationId, input.now);
      const allowed = characterId !== null;
      const reason: CorpAccessReason = allowed ? 'member' : 'not_member';
      await recordCorpAccessDecision({
        userId: input.userId,
        corporationId,
        characterId,
        allowed,
        reason,
      });
      return { allowed, reason, characterId };
    },
  };
}
