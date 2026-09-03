// can't reach ESI leaves the cache stale ⇒ deny). EVERY decision is recorded —

import { refreshStaleAffiliationsForUser } from './affiliation';
import { memberCharacterIdInCorp } from './membership';
import { getUserAffiliations, recordCorpAccessDecision } from './affiliation-store';

export type CorpAccessReason = 'member' | 'not_member';

export interface CorpAccessDecision {
  allowed: boolean;
  reason: CorpAccessReason;

  characterId: number | null;
}

export async function decideCorpAccess(input: {
  userId: string;
  corporationId: number;
}): Promise<CorpAccessDecision> {
  const { userId, corporationId } = input;
  await refreshStaleAffiliationsForUser(userId);
  const affiliations = await getUserAffiliations(userId);
  const characterId = memberCharacterIdInCorp(affiliations, corporationId, new Date());
  const allowed = characterId !== null;
  const reason: CorpAccessReason = allowed ? 'member' : 'not_member';
  await recordCorpAccessDecision({ userId, corporationId, characterId, allowed, reason });
  return { allowed, reason, characterId };
}
