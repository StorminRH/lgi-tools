import type { CorpDirectorResolution, CorpMemberCandidate } from './types';

export function classifyCorpDirector(candidates: CorpMemberCandidate[]): CorpDirectorResolution {
  if (candidates.length === 0) return { kind: 'unavailable' };
  const roleHolder = candidates.find((candidate) => candidate.hasRole);
  if (roleHolder === undefined) return { kind: 'needs_role' };
  return {
    kind: 'token',
    vendingCharacterId: roleHolder.vendingCharacterId,
    accessToken: roleHolder.accessToken,
  };
}
